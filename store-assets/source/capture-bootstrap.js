(() => {
  const capture = globalThis.__TABOARD_CAPTURE__;
  if (!capture) throw new Error("Missing Taboard capture scenario.");
  const nativeDateNow = Date.now.bind(Date);
  Date.now = () => capture.now ?? nativeDateNow();
  const motionStyle = document.createElement("style");
  motionStyle.textContent = `
    *, *::before, *::after {
      transition-duration: 0s !important;
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      caret-color: transparent !important;
    }
  `;
  document.head.appendChild(motionStyle);

  const stateKey = "taboard.state.v1";
  const driveMetaKey = "taboard.drive.meta.v1";
  const driveDirtyKey = "taboard.drive.dirty.v1";
  const storage = {
    [stateKey]: capture.state,
    [driveMetaKey]: capture.driveMeta ?? null,
    [driveDirtyKey]: false,
  };
  const listeners = new Set();
  const event = {
    addListener(listener) {
      listeners.add(listener);
    },
    removeListener(listener) {
      listeners.delete(listener);
    },
  };

  const resolveGet = (keys) => {
    if (typeof keys === "string") return { [keys]: storage[keys] };
    if (Array.isArray(keys)) {
      return Object.fromEntries(keys.map((key) => [key, storage[key]]));
    }
    if (keys && typeof keys === "object") {
      return Object.fromEntries(
        Object.entries(keys).map(([key, fallback]) => [
          key,
          storage[key] ?? fallback,
        ]),
      );
    }
    return { ...storage };
  };

  const runtime = {
    lastError: null,
    getURL(resourcePath) {
      return new URL(`/${resourcePath}`, location.origin).href;
    },
  };

  globalThis.chrome = {
    runtime,
    storage: {
      local: {
        get(keys, callback) {
          callback(resolveGet(keys));
        },
        set(values, callback) {
          Object.assign(storage, values);
          callback?.();
        },
        remove(keys, callback) {
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            delete storage[key];
          }
          callback?.();
        },
      },
      onChanged: event,
    },
    tabs: {
      query(_query, callback) {
        callback(capture.tabs);
      },
      update(_tabId, _options, callback) {
        callback?.({});
      },
      remove(_tabId, callback) {
        callback?.();
      },
      create(options, callback) {
        callback?.({ id: 999, ...options });
      },
      group(_options, callback) {
        callback?.(1);
      },
      onCreated: event,
      onRemoved: event,
      onUpdated: event,
      onMoved: event,
      onAttached: event,
      onDetached: event,
      onReplaced: event,
      onActivated: event,
    },
    tabGroups: {
      update(_groupId, options, callback) {
        callback?.({ id: 1, ...options });
      },
    },
    windows: {
      getCurrent(callback) {
        callback({ id: 1 });
      },
    },
    identity: {
      getAuthToken(_options, callback) {
        runtime.lastError = { message: "Authentication disabled in capture mode." };
        callback(null);
        queueMicrotask(() => {
          runtime.lastError = null;
        });
      },
      removeCachedAuthToken(_options, callback) {
        callback?.();
      },
    },
  };

  const finishCaptureSetup = async () => {
    const deadline = performance.now() + 5_000;
    while (performance.now() < deadline && !document.querySelector(".card")) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (capture.afterRender === "open-drive-menu") {
      const driveDeadline = performance.now() + 5_000;
      while (
        performance.now() < driveDeadline &&
        !document.getElementById("drive-control")?.classList.contains("connected")
      ) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      if (!document.getElementById("drive-control")?.classList.contains("connected")) {
        throw new Error("Drive control did not reach the connected state.");
      }
      document.getElementById("drive-connect")?.click();
      const menuDeadline = performance.now() + 2_000;
      while (
        performance.now() < menuDeadline &&
        document.getElementById("drive-menu")?.dataset.open !== "true"
      ) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      if (document.getElementById("drive-menu")?.dataset.open !== "true") {
        throw new Error("Drive menu did not open.");
      }
    }
    await document.fonts?.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    document.documentElement.dataset.captureReady = "true";
  };

  window.addEventListener("load", () => {
    finishCaptureSetup().catch((error) => {
      document.documentElement.dataset.captureError = error.message;
    });
  });
})();
