import {
  expect,
  test,
} from "@playwright/test";

const ADMIN_EMAIL =
  process.env.DASHBOARD_ADMIN_EMAIL ||
  "admin@example.invalid";

const ADMIN_PASSWORD =
  process.env.DASHBOARD_ADMIN_PASSWORD ||
  "CI-only-password-12345";

const DRAFT_PREFIX =
  "sikhadenge:engageos:draft:v1:";

async function login(page) {
  await page.goto("/login");

  await page
    .getByLabel("Work Email")
    .fill(ADMIN_EMAIL);

  await page
    .getByLabel("Password", { exact: true })
    .fill(ADMIN_PASSWORD);

  await page
    .getByRole(
      "button",
      { name: "Sign in" },
    )
    .click();

  await expect(page).toHaveURL(
    /\/inbox(?:\?|$)/,
  );

  await expect(
    page.locator(".sx-inbox"),
  ).toBeVisible();
}

test(
  "Phase 15 manifest service worker and privacy-safe offline shell",
  async ({ page, context }) => {
    const manifestResponse =
      await page.request.get(
        "/manifest.webmanifest",
      );

    expect(
      manifestResponse.ok(),
    ).toBe(true);

    const manifest =
      await manifestResponse.json();

    expect(manifest.name).toBe(
      "SikhaDenge EngageOS",
    );

    expect(
      manifest.start_url,
    ).toBe("/inbox");

    expect(
      manifest.scope,
    ).toBe("/");

    expect(
      manifest.display,
    ).toBe("standalone");

    expect(
      Array.isArray(
        manifest.icons,
      ),
    ).toBe(true);

    expect(
      manifest.icons.some(
        (icon) =>
          icon.sizes ===
          "192x192",
      ),
    ).toBe(true);

    expect(
      manifest.icons.some(
        (icon) =>
          icon.sizes ===
          "512x512",
      ),
    ).toBe(true);

    for (
      const icon
      of manifest.icons
    ) {
      const response =
        await page.request.get(
          icon.src,
        );

      expect(
        response.ok(),
      ).toBe(true);
    }

    await page.goto(
      "/offline",
      {
        waitUntil:
          "networkidle",
      },
    );

    await expect(
      page.getByRole(
        "heading",
        {
          name:
            "You are offline",
        },
      ),
    ).toBeVisible();

    const registration =
      await page.evaluate(
        async () => {
          if (
            !(
              "serviceWorker"
              in navigator
            )
          ) {
            return null;
          }

          const ready =
            await navigator
              .serviceWorker
              .ready;

          return {
            scope:
              ready.scope,
            active:
              Boolean(
                ready.active,
              ),
          };
        },
      );

    expect(
      registration,
    ).not.toBeNull();

    expect(
      registration.active,
    ).toBe(true);

    await page.reload({
      waitUntil:
        "domcontentloaded",
    });

    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              Boolean(
                navigator
                  .serviceWorker
                  .controller,
              ),
          ),
      )
      .toBe(true);

    await context.setOffline(
      true,
    );

    try {
      const apiResult =
        await page.evaluate(
          async () => {
            try {
              await fetch(
                "/api/meta/status",
              );

              return "response";
            } catch {
              return "network-error";
            }
          },
        );

      expect(
        apiResult,
      ).toBe(
        "network-error",
      );

      await page.goto(
        "/offline?phase15-offline-probe=1",
        {
          waitUntil:
            "domcontentloaded",
        },
      );

      await expect(
        page.locator(
          '[data-phase15-offline-shell="true"]',
        ),
      ).toBeVisible();
    } finally {
      await context.setOffline(
        false,
      );
    }
  },
);

test(
  "Phase 15 counselor draft survives reload",
  async ({ page }) => {
    await login(page);

    await page.evaluate(
      (prefix) => {
        for (
          let index =
            localStorage.length - 1;
          index >= 0;
          index -= 1
        ) {
          const key =
            localStorage.key(index);

          if (
            key?.startsWith(
              prefix,
            )
          ) {
            localStorage.removeItem(
              key,
            );
          }
        }
      },
      DRAFT_PREFIX,
    );

    const draft =
      page.getByRole(
        "textbox",
        {
          name:
            "Message draft",
        },
      );

    await expect(
      draft,
    ).toBeVisible();

    const draftText =
      "Phase 15 unsent counselor draft recovery check.";

    await draft.fill(
      draftText,
    );

    await expect
      .poll(
        () =>
          page.evaluate(
            ({
              prefix,
              body,
            }) => {
              for (
                let index = 0;
                index <
                localStorage.length;
                index += 1
              ) {
                const key =
                  localStorage.key(
                    index,
                  );

                if (
                  !key?.startsWith(
                    prefix,
                  )
                ) {
                  continue;
                }

                try {
                  const parsed =
                    JSON.parse(
                      localStorage.getItem(
                        key,
                      ) || "{}",
                    );

                  if (
                    parsed.body ===
                    body
                  ) {
                    return true;
                  }
                } catch {
                  // continue
                }
              }

              return false;
            },
            {
              prefix:
                DRAFT_PREFIX,
              body:
                draftText,
            },
          ),
      )
      .toBe(true);

    await page.reload({
      waitUntil:
        "domcontentloaded",
    });

    await expect(
      page.getByRole(
        "textbox",
        {
          name:
            "Message draft",
        },
      ),
    ).toHaveValue(
      draftText,
    );

    await expect(
      page.getByRole(
        "button",
        {
          name:
            "Send message",
        },
      ),
    ).toBeVisible();

    await expect(
      page.getByRole(
        "button",
        {
          name:
            "Attach file",
        },
      ),
    ).toBeVisible();
  },
);

test(
  "Phase 15 login accessibility smoke",
  async ({ page }) => {
    await page.goto("/login");

    await expect(
      page.getByLabel(
        "Work Email",
      ),
    ).toBeVisible();

    await expect(
      page.getByLabel(
        "Password",
        { exact: true },
      ),
    ).toBeVisible();

    await expect(
      page.getByRole(
        "button",
        {
          name:
            "Sign in",
        },
      ),
    ).toBeVisible();
  },
);
