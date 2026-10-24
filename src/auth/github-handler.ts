import {
  AuthorizationError,
  authorizationErrorRedirect,
  CimdFetchError,
  type ConsentDescription,
  type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import type { Env } from "../env";
import { findOrCreateUserByIdentity } from "./identity";

type OAuthEnv = Env & { OAUTH_PROVIDER: OAuthHelpers };

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

export const githubAuthHandler: ExportedHandler<Env> = {
  async fetch(request, baseEnv): Promise<Response> {
    const env = baseEnv as OAuthEnv;
    const url = new URL(request.url);
    try {
      if (url.pathname === "/authorize" && request.method === "GET") {
        const authRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
        const details = await env.OAUTH_PROVIDER.describeConsent(authRequest);
        const consent = await env.OAUTH_PROVIDER.beginConsent(authRequest);
        consent.headers.set("content-type", "text/html; charset=utf-8");
        return new Response(renderConsent(details, consent.handle), { headers: consent.headers });
      }

      if (url.pathname === "/authorize" && request.method === "POST") {
        const form = await request.formData();
        const handle = String(form.get("handle") ?? "");
        if (form.get("decision") !== "approve") {
          const denied = await env.OAUTH_PROVIDER.denyConsent(request, handle);
          return new Response(null, { status: 302, headers: denied.headers });
        }
        const approved = await env.OAUTH_PROVIDER.approveConsent(request, handle, {
          scope: form.getAll("scope").map(String),
        });
        const verifier = `${crypto.randomUUID()}${crypto.randomUUID()}`;
        const upstream = await env.OAUTH_PROVIDER.beginUpstream(approved.request, {
          data: { verifier },
          headers: approved.headers,
        });
        upstream.headers.set("location", await githubAuthorizeUrl(env, upstream.state, verifier));
        return new Response(null, { status: 302, headers: upstream.headers });
      }

      if (url.pathname === "/callback" && request.method === "GET") {
        const resumed = await env.OAUTH_PROVIDER.finishUpstream<{ verifier: string }>(request);
        if (url.searchParams.has("error")) {
          resumed.headers.set(
            "location",
            authorizationErrorRedirect(resumed.request, "access_denied"),
          );
          return new Response(null, { status: 302, headers: resumed.headers });
        }
        const code = url.searchParams.get("code");
        if (!code)
          return new Response("GitHub did not return an authorization code.", { status: 400 });
        const accessToken = await exchangeCode(env, code, resumed.data.verifier);
        const github = await fetchGitHubIdentity(accessToken);
        if (!isAllowedLogin(env.ALLOWED_GITHUB_LOGINS, github.user.login)) {
          return new Response(privateBetaPage(), {
            status: 403,
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }
        const props = await findOrCreateUserByIdentity(env.DB, "github", String(github.user.id), {
          email: github.email,
          emailVerified: Boolean(github.email),
          username: github.user.login,
          name: github.user.name ?? github.user.login,
          avatarUrl: github.user.avatar_url,
        });
        const completed = await env.OAUTH_PROVIDER.completeAuthorization({
          request: resumed.request,
          userId: props.userId,
          metadata: { provider: "github", login: github.user.login },
          scope: resumed.request.scope,
          props,
        });
        resumed.headers.set("location", completed.redirectTo);
        return new Response(null, { status: 302, headers: resumed.headers });
      }

      return new Response("Not Found", { status: 404 });
    } catch (error) {
      if (error instanceof AuthorizationError && error.redirectTo) {
        return Response.redirect(error.redirectTo, 302);
      }
      if (error instanceof AuthorizationError || error instanceof CimdFetchError) {
        const message =
          error instanceof AuthorizationError
            ? error.description
            : "This app could not be verified.";
        return new Response(message, { status: 400 });
      }
      throw error;
    }
  },
};

async function githubAuthorizeUrl(env: Env, state: string, verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = base64Url(new Uint8Array(digest));
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", `${env.PUBLIC_BASE_URL}/callback`);
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

async function exchangeCode(env: Env, code: string, verifier: string): Promise<string> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${env.PUBLIC_BASE_URL}/callback`,
      code_verifier: verifier,
    }),
  });
  if (!response.ok) throw new Error(`GitHub token exchange failed (${response.status})`);
  const payload = (await response.json()) as { access_token?: string; error?: string };
  if (!payload.access_token)
    throw new Error(`GitHub token exchange failed (${payload.error ?? "unknown"})`);
  return payload.access_token;
}

async function fetchGitHubIdentity(token: string): Promise<{ user: GitHubUser; email?: string }> {
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "user-agent": "self-deprecation-mcp",
    "x-github-api-version": "2022-11-28",
  };
  const [userResponse, emailsResponse] = await Promise.all([
    fetch("https://api.github.com/user", { headers }),
    fetch("https://api.github.com/user/emails", { headers }),
  ]);
  if (!userResponse.ok) throw new Error(`GitHub profile request failed (${userResponse.status})`);
  const user = (await userResponse.json()) as GitHubUser;
  let email = user.email ?? undefined;
  if (emailsResponse.ok) {
    const emails = (await emailsResponse.json()) as GitHubEmail[];
    email = emails.find((candidate) => candidate.primary && candidate.verified)?.email ?? email;
  }
  return { user, email };
}

function isAllowedLogin(raw: string | undefined, login: string): boolean {
  if (!raw?.trim()) return true;
  return raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(login.toLowerCase());
}

function renderConsent(details: ConsentDescription, handle: string): string {
  const scopes = details.scope
    .map(
      (scope) =>
        `<label><input type="checkbox" name="scope" value="${escapeHtml(scope)}" checked> ${escapeHtml(scope)}</label>`,
    )
    .join("<br>");
  const publisher = details.clientDomain
    ? `Published by <strong>${escapeHtml(details.clientDomain)}</strong>.`
    : "This client registered itself; its name is not verified.";
  return `<!doctype html><meta charset="utf-8"><title>Authorize ${escapeHtml(details.clientName)}</title>
<main><h1>Allow ${escapeHtml(details.clientName)}?</h1><p>${publisher}</p>
<p>Access returns to <strong>${escapeHtml(details.redirectHost)}</strong>.</p>
<form method="post"><input type="hidden" name="handle" value="${escapeHtml(handle)}">${scopes}
<p><button name="decision" value="approve">Continue with GitHub</button> <button name="decision" value="deny">Cancel</button></p></form>
<p>Every deprecation notice deserves a migration guide. Yours stays private.</p></main>`;
}

function privateBetaPage(): string {
  return '<!doctype html><meta charset="utf-8"><h1>Private beta</h1><p>This GitHub account is not on the allowlist yet. Your migration guide is still waiting.</p>';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
