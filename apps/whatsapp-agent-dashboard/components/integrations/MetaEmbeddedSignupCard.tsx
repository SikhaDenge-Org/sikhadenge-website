"use client";

import { useEffect, useState } from "react";

const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID?.trim() || "2829197614112023";
const EMBEDDED_SIGNUP_CONFIG_ID =
  process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID?.trim() ||
  "2546066989202791";

type FacebookLoginResponse = {
  authResponse?: {
    code?: string;
  };
  status?: string;
};

type FacebookSdk = {
  init(options: {
    appId: string;
    cookie: boolean;
    xfbml: boolean;
    version: string;
  }): void;
  login(
    callback: (response: FacebookLoginResponse) => void,
    options: Record<string, unknown>,
  ): void;
};

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

type SignupSession = {
  wabaId?: string;
  phoneNumberId?: string;
  businessId?: string;
};

function parseSignupSession(data: unknown): SignupSession {
  if (!data || typeof data !== "object") return {};
  const value = data as Record<string, unknown>;
  const nested =
    value.data && typeof value.data === "object"
      ? (value.data as Record<string, unknown>)
      : {};

  return {
    wabaId:
      typeof nested.waba_id === "string"
        ? nested.waba_id
        : typeof value.waba_id === "string"
          ? value.waba_id
          : undefined,
    phoneNumberId:
      typeof nested.phone_number_id === "string"
        ? nested.phone_number_id
        : typeof value.phone_number_id === "string"
          ? value.phone_number_id
          : undefined,
    businessId:
      typeof nested.business_id === "string"
        ? nested.business_id
        : typeof value.business_id === "string"
          ? value.business_id
          : undefined,
  };
}

export default function MetaEmbeddedSignupCard() {
  const [sdkReady, setSdkReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(
    "Connect the WhatsApp Business App through Meta's secure onboarding flow.",
  );
  const [session, setSession] = useState<SignupSession>({});

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!/^https:\/\/(?:www\.|web\.)?facebook\.com$/.test(event.origin)) return;

      let payload: unknown = event.data;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }
      if (!payload || typeof payload !== "object") return;

      const value = payload as Record<string, unknown>;
      if (value.type !== "WA_EMBEDDED_SIGNUP") return;

      const nextSession = parseSignupSession(value);
      setSession((current) => ({ ...current, ...nextSession }));

      if (value.event === "FINISH" || value.event === "FINISH_ONLY_WABA") {
        setStatus(
          "Meta onboarding completed. Connection details were received securely.",
        );
      } else if (value.event === "CANCEL") {
        setStatus("WhatsApp connection was cancelled before completion.");
      } else if (value.event === "ERROR") {
        setStatus("Meta reported an error during WhatsApp connection.");
      }
    }

    window.addEventListener("message", handleMessage);

    window.fbAsyncInit = () => {
      window.FB?.init({
        appId: META_APP_ID,
        cookie: true,
        xfbml: false,
        version: "v25.0",
      });
      setSdkReady(true);
    };

    if (window.FB) {
      window.fbAsyncInit();
    } else if (!document.getElementById("facebook-jssdk")) {
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      document.body.appendChild(script);
    }

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  function connectWhatsApp() {
    if (!window.FB || !sdkReady) {
      setStatus("Meta login is still loading. Please try again in a few seconds.");
      return;
    }

    setBusy(true);
    setStatus("Opening Meta's secure WhatsApp connection window...");

    window.FB.login(
      (response) => {
        setBusy(false);
        if (response.authResponse?.code) {
          setStatus(
            "Meta authorised the connection. Complete the remaining steps in the popup.",
          );
          return;
        }
        setStatus("Meta login was closed or permission was not granted.");
      },
      {
        config_id: EMBEDDED_SIGNUP_CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: "whatsapp_business_app_onboarding",
          sessionInfoVersion: "3",
        },
      },
    );
  }

  return (
    <section className="suite-card">
      <header>
        <div>
          <span>WhatsApp Business App coexistence</span>
          <h3>Connect WhatsApp</h3>
          <p>
            Use the same business number in the WhatsApp Business App for manual
            chatting and in this dashboard for AI-assisted conversations.
          </p>
        </div>
      </header>

      <div className="suite-stack">
        <div className="suite-alert">{status}</div>
        {session.wabaId || session.phoneNumberId || session.businessId ? (
          <div className="integration-provider-list">
            <article>
              <div>
                <strong>Meta connection details received</strong>
                <p>
                  WABA: {session.wabaId || "Pending"} · Phone number: {session.phoneNumberId || "Pending"}
                  {session.businessId ? ` · Business: ${session.businessId}` : ""}
                </p>
              </div>
            </article>
          </div>
        ) : null}
      </div>

      <footer>
        <button type="button" onClick={connectWhatsApp} disabled={busy || !sdkReady}>
          {busy ? "Opening Meta..." : sdkReady ? "Connect WhatsApp" : "Loading Meta..."}
        </button>
      </footer>
    </section>
  );
}
