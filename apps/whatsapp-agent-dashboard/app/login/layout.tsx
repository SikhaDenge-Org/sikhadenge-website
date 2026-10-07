import type { ReactNode } from "react";

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <div className="page01-login-asset-root" data-page01-layout="direct-inline-v6">
      {children}
    </div>
  );
}
