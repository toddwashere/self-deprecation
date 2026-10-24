export interface AuthProps {
  userId: string;
  name: string;
  email?: string;
  nickname?: string;
  avatarUrl?: string;
}

export interface AuthEnvironment {
  ENVIRONMENT: "development" | "production";
  DEV_AUTH_BYPASS?: string;
}
