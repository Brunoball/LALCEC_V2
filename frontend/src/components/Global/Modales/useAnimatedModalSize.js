import { useEffect, useRef } from "react";

const DEFAULT_DURATION = 190;
const DEFAULT_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";

/**
 * Anima de forma sutil los cambios de alto de un modal cuyo contenido es dinámico.
 *
 * Se mide el alto natural antes/después del cambio y se usa Web Animations API,
 * evitando fijar un height permanente. De esta forma siguen funcionando max-height,
 * overflow y los layouts responsive definidos por CSS.
 */
export default function useAnimatedModalSize(
  modalRef,
  active = true,
  { duration = DEFAULT_DURATION, easing = DEFAULT_EASING } = {},
) {
  const lastHeightRef = useRef(null);

  useEffect(() => {
    if (!active || typeof window === "undefined") return undefined;

    const modal = modalRef.current;
    if (!modal) return undefined;

    const prefersReducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;

    let frameId = 0;
    let animation = null;
    let pendingMeasure = false;
    let disposed = false;

    const readHeight = () => modal.getBoundingClientRect().height;

    const syncHeight = () => {
      lastHeightRef.current = readHeight();
    };

    const finishAnimation = () => {
      if (disposed) return;
      animation = null;
      modal.classList.remove("is-size-transitioning");
      syncHeight();

      if (pendingMeasure) {
        pendingMeasure = false;
        scheduleMeasure();
      }
    };

    const animateHeight = (fromHeight, toHeight) => {
      if (
        prefersReducedMotion ||
        typeof modal.animate !== "function" ||
        Math.abs(toHeight - fromHeight) < 1
      ) {
        lastHeightRef.current = toHeight;
        return;
      }

      modal.classList.add("is-size-transitioning");
      animation = modal.animate(
        [
          { height: `${fromHeight}px` },
          { height: `${toHeight}px` },
        ],
        {
          duration,
          easing,
        },
      );

      animation.addEventListener("finish", finishAnimation, { once: true });
      animation.addEventListener("cancel", finishAnimation, { once: true });
    };

    function measure() {
      frameId = 0;
      if (disposed) return;

      if (animation) {
        pendingMeasure = true;
        return;
      }

      const nextHeight = readHeight();
      const previousHeight = lastHeightRef.current;

      if (!Number.isFinite(previousHeight) || previousHeight <= 0) {
        lastHeightRef.current = nextHeight;
        return;
      }

      if (Math.abs(nextHeight - previousHeight) < 1) return;
      animateHeight(previousHeight, nextHeight);
    }

    function scheduleMeasure() {
      if (disposed || frameId) return;
      frameId = window.requestAnimationFrame(measure);
    }

    const observedChildren = new Set();
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(scheduleMeasure)
        : null;

    const observeDirectChildren = () => {
      if (!resizeObserver) return;
      Array.from(modal.children).forEach((child) => {
        if (observedChildren.has(child)) return;
        observedChildren.add(child);
        resizeObserver.observe(child);
      });
    };

    const mutationObserver =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(() => {
            observeDirectChildren();
            scheduleMeasure();
          })
        : null;

    syncHeight();
    observeDirectChildren();
    mutationObserver?.observe(modal, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    const handleViewportResize = () => {
      if (animation) {
        animation.cancel();
        animation = null;
      }
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(syncHeight);
    };

    window.addEventListener("resize", handleViewportResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", handleViewportResize);
      window.cancelAnimationFrame(frameId);
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      animation?.cancel();
      modal.classList.remove("is-size-transitioning");
      lastHeightRef.current = null;
    };
  }, [active, duration, easing, modalRef]);
}
