import crypto from "crypto";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import { storage } from "../../storage";

let setupDone = false;

function getBaseUrl(req: any): string {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${protocol}://${host}`;
}

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export async function setupAuth(app: Express) {
  if (setupDone) return;
  setupDone = true;

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: true,
    store: storage.sessionStore,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));

  let oidcConfig: any;
  try {
    const resp = await fetch(
      "https://replit.com/oidc/.well-known/openid-configuration"
    );
    oidcConfig = await resp.json();
  } catch {
    console.error("Failed to fetch OIDC config, using defaults");
    oidcConfig = {
      issuer: "https://replit.com/oidc",
      authorization_endpoint: "https://replit.com/oidc/auth",
      token_endpoint: "https://replit.com/oidc/token",
      userinfo_endpoint: "https://replit.com/oidc/me",
    };
  }

  const clientId = process.env.REPL_ID!;

  app.get("/api/login", (req, res) => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = crypto.randomBytes(16).toString("hex");

    (req.session as any).oidcState = state;
    (req.session as any).codeVerifier = codeVerifier;

    const callbackUrl = `${getBaseUrl(req)}/api/callback`;

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: callbackUrl,
      scope: "openid profile email",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    req.session.save(() => {
      res.redirect(
        `${oidcConfig.authorization_endpoint}?${params.toString()}`
      );
    });
  });

  app.get("/api/callback", async (req, res) => {
    try {
      const { code, state } = req.query;

      if (!code || !state) {
        console.error("Missing code or state in callback");
        return res.redirect("/");
      }

      const savedState = (req.session as any).oidcState;
      const codeVerifier = (req.session as any).codeVerifier;

      if (state !== savedState) {
        console.error("State mismatch");
        return res.redirect("/");
      }

      if (!codeVerifier) {
        console.error("Missing code verifier");
        return res.redirect("/");
      }

      const callbackUrl = `${getBaseUrl(req)}/api/callback`;

      const tokenResp = await fetch(oidcConfig.token_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code as string,
          redirect_uri: callbackUrl,
          client_id: clientId,
          code_verifier: codeVerifier,
        }).toString(),
      });

      if (!tokenResp.ok) {
        const errorText = await tokenResp.text();
        console.error("Token exchange failed:", errorText);
        return res.redirect("/");
      }

      const tokenData = await tokenResp.json();
      const accessToken = tokenData.access_token;

      const userInfoResp = await fetch(oidcConfig.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!userInfoResp.ok) {
        console.error("UserInfo fetch failed");
        return res.redirect("/");
      }

      const profile = await userInfoResp.json();

      const user = await storage.upsertUser({
        username: profile.username || profile.sub,
        email: profile.email || null,
        firstName: profile.first_name || null,
        lastName: profile.last_name || null,
        profileImageUrl: profile.profile_image_url || null,
      });

      delete (req.session as any).oidcState;
      delete (req.session as any).codeVerifier;
      (req.session as any).userId = user.id;

      req.session.save(() => {
        res.redirect("/");
      });
    } catch (err) {
      console.error("Auth callback error:", err);
      res.redirect("/");
    }
  });

  app.get("/api/logout", (req, res) => {
    (req.session as any).userId = null;
    req.session.destroy(() => {
      res.redirect("/");
    });
  });

  app.get("/api/auth/user", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) {
      return res.json(null);
    }
    try {
      const user = await storage.getUser(userId);
      res.json(user);
    } catch {
      res.json(null);
    }
  });
}

export function isAuthenticated(req: any, res: any, next: any) {
  const userId = (req.session as any)?.userId;
  if (userId) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
}
