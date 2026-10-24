import { useCallback, useEffect, useState } from "react";
import type { Bridge } from "../../../web/src/bridge";
import { COPY } from "../../../web/src/copy";
import { Button, Card, Chip, ErrorBanner, Loading } from "../../../web/src/ui";

interface Profile {
  id: string;
  name: string;
  email?: string;
  nickname?: string;
}

type ActionState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; message: string }
  | {
      kind: "error";
      message: string;
    };

export function SettingsPanel({ bridge }: { bridge: Bridge }) {
  const [profile, setProfile] = useState<Profile>();
  const [profileError, setProfileError] = useState<string>();
  const [action, setAction] = useState<ActionState>({ kind: "idle" });

  const loadProfile = useCallback(async () => {
    setProfileError(undefined);
    const result = await bridge.callTool<Profile>("get_profile");
    if (result.error) setProfileError(result.error.message);
    else setProfile(result.data);
  }, [bridge]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const runAction = async (tool: "reset_my_data" | "load_demo_data") => {
    setAction({ kind: "busy" });
    const result = await bridge.callTool<{ message?: string }>(
      tool,
      tool === "reset_my_data" ? { confirm: "RESET" } : {},
    );
    setAction(
      result.error
        ? { kind: "error", message: result.error.message }
        : { kind: "done", message: result.data?.message ?? "Complete." },
    );
  };

  return (
    <div className="stack">
      <Card>
        <div className="card-heading">
          <div>
            <p className="eyebrow">Identity</p>
            <h2>{profile?.name ?? "Checking the badge…"}</h2>
          </div>
          <Chip tone={profile ? "good" : "neutral"}>
            {profile ? "Verified" : profileError ? "Unavailable" : "Loading"}
          </Chip>
        </div>
        {!profile && !profileError ? <Loading line={COPY.loading[0]} /> : null}
        {profileError ? (
          <ErrorBanner message={profileError} retry={() => void loadProfile()} />
        ) : null}
        {profile ? (
          <p className="muted">{profile.email ?? `@${profile.nickname ?? profile.id}`}</p>
        ) : null}
      </Card>

      <Card>
        <p className="eyebrow">Demo controls</p>
        <h2>Rehearse without career data casualties</h2>
        <p className="muted">
          Demo load is idempotent. Reset keeps your login and removes only your workspace data.
        </p>
        <div className="actions">
          <Button
            disabled={action.kind === "busy"}
            onClick={() => void runAction("load_demo_data")}
          >
            Load demo data
          </Button>
          <Button
            className="secondary"
            disabled={action.kind === "busy"}
            onClick={() => void runAction("reset_my_data")}
          >
            Reset my data
          </Button>
        </div>
        {action.kind === "busy" ? <Loading line={COPY.loading[1]} /> : null}
        {action.kind === "done" ? <p className="success">{action.message}</p> : null}
        {action.kind === "error" ? <ErrorBanner message={action.message} /> : null}
      </Card>
    </div>
  );
}
