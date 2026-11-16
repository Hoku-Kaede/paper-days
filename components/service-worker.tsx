"use client";

import { useEffect } from "react";

/* Registers the service worker so the diary can be installed on a phone
   (Android's "Add to home screen" wants one). Off in development —
   a cached shell would fight the dev server. */

export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* no worker — the diary still works, it just can't be installed */
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
