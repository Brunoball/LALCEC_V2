import { useLayoutEffect } from "react";

const RESIZE_DURATION_MS = 150;
const RESIZE_EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const SIZE_EPSILON_PX = 1;

const readObservedHeight = (entry) => {
  if (!entry) return 0;

  const borderBox = entry.borderBoxSize;
  if (Array.isArray(borderBox) && borderBox[0]?.blockSize) {
    return borderBox[0].blockSize;
  }
  if (borderBox?.blockSize) return borderBox.blockSize;

  const rectHeight = entry.contentRect?.height;
  return Number.isFinite(rectHeight) ? rectHeight : 0;
};

/**
 * Anima los cambios de alto del modal sin realizar lecturas sincronicas de
 * layout (offsetHeight/getBoundingClientRect/scrollHeight).
 *
 * ResizeObserver entrega el alto ya calculado por el navegador. Durante la
 * transicion el observer se desconecta para no observar el `height` temporal
 * aplicado por este mismo hook y se vuelve a conectar cuando termina.
 */
export default function useAnimatedModalSize(modalRef, open = true) {
  useLayoutEffect(() => {
    const modal = modalRef?.current;

    if (!open || !modal || typeof window === "undefined") {
      return undefined;
    }

    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;

    if (reduceMotion || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const previousInlineTransition = modal.style.transition;
    const previousInlineHeight = modal.style.height;

    let destroyed = false;
    let initialized = false;
    let animating = false;
    let lastHeight = 0;
    let targetHeight = 0;
    let animationFrame = 0;
    let reconnectFrame = 0;
    let fallbackTimer = 0;

    const clearTimer = () => {
      if (fallbackTimer) {
        window.clearTimeout(fallbackTimer);
        fallbackTimer = 0;
      }
    };

    let observer;

    const observeModal = () => {
      if (destroyed || !observer) return;
      observer.observe(modal, { box: "border-box" });
    };

    const finishTransition = () => {
      if (destroyed || !animating) return;

      clearTimer();
      animating = false;
      lastHeight = targetHeight || lastHeight;

      modal.classList.remove("is-size-transitioning");
      modal.style.transition = previousInlineTransition;
      modal.style.height = previousInlineHeight;

      // Reconectamos en el siguiente frame para que el navegador restaure
      // primero la altura natural. No necesitamos leer ninguna medida aqui.
      reconnectFrame = window.requestAnimationFrame(() => {
        reconnectFrame = 0;
        observeModal();
      });
    };

    const animateTo = (nextHeight) => {
      if (destroyed || animating || !Number.isFinite(nextHeight) || nextHeight <= 0) {
        return;
      }

      const fromHeight = lastHeight;
      if (!Number.isFinite(fromHeight) || fromHeight <= 0) {
        lastHeight = nextHeight;
        return;
      }

      if (Math.abs(nextHeight - fromHeight) < SIZE_EPSILON_PX) {
        lastHeight = nextHeight;
        return;
      }

      targetHeight = nextHeight;
      animating = true;
      observer.disconnect();

      // El alto de origen y destino vienen del propio ResizeObserver, por lo
      // que no forzamos al navegador a recalcular layout para obtenerlos.
      modal.style.transition = "none";
      modal.style.height = `${fromHeight}px`;
      modal.classList.add("is-size-transitioning");

      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        if (destroyed) return;

        modal.style.transition = `height ${RESIZE_DURATION_MS}ms ${RESIZE_EASING} 0ms`;
        modal.style.height = `${nextHeight}px`;

        fallbackTimer = window.setTimeout(
          finishTransition,
          RESIZE_DURATION_MS + 70,
        );
      });
    };

    observer = new ResizeObserver((entries) => {
      if (destroyed || animating) return;

      const entry = entries.find((item) => item.target === modal) || entries[0];
      const nextHeight = readObservedHeight(entry);
      if (!Number.isFinite(nextHeight) || nextHeight <= 0) return;

      if (!initialized) {
        initialized = true;
        lastHeight = nextHeight;
        return;
      }

      animateTo(nextHeight);
    });

    const handleTransitionEnd = (event) => {
      if (event.target === modal && event.propertyName === "height") {
        finishTransition();
      }
    };

    modal.addEventListener("transitionend", handleTransitionEnd);
    observeModal();

    return () => {
      destroyed = true;
      observer.disconnect();
      modal.removeEventListener("transitionend", handleTransitionEnd);

      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      if (reconnectFrame) window.cancelAnimationFrame(reconnectFrame);
      clearTimer();

      modal.classList.remove("is-size-transitioning");
      modal.style.transition = previousInlineTransition;
      modal.style.height = previousInlineHeight;
    };
  }, [modalRef, open]);
}
