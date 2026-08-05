import React, { useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFilePdf, faXmark } from "@fortawesome/free-solid-svg-icons";
import { inferMimeFromUrl, isImageMime, isPdfMime } from "../utils/botPanelUtils";
import { useModalEscapeStack } from "./useModalEscapeStack";
import "./MediaViewerModal.css";

const MediaViewerModal = ({ open, onClose, item }) => {
  const boxRef = useRef(null);

  useModalEscapeStack(open, onClose);

  useEffect(() => {
    if (!open) return;

    const onDown = (e) => {
      const box = boxRef.current;
      if (!box) return;
      if (!box.contains(e.target)) onClose?.();
    };

    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, onClose]);

  if (!open || !item?.url) return null;

  const mime = item.mime || inferMimeFromUrl(item.url);
  const isImg = isImageMime(mime);
  const isPdf = isPdfMime(mime);

  return (
    <div className="wp-media-backdrop" role="dialog" aria-label="Visor de archivo">
      <div className="wp-media-modal" ref={boxRef}>
        <div className="wp-media-top">
          <div className="wp-media-heading">
            <span className="wp-media-eyebrow">Vista previa</span>
            <div className="wp-media-title">
              {isPdf ? <FontAwesomeIcon icon={faFilePdf} /> : null}
              <span>{item.name || (isPdf ? "Documento PDF" : "Imagen")}</span>
            </div>
          </div>

          <div className="wp-media-actions">
            <a className="wp-media-open" href={item.url} target="_blank" rel="noreferrer">
              Abrir
            </a>
            <button
              className="wp-media-close"
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
        </div>

        <div className={`wp-media-body ${isImg ? "wp-media-body--image" : ""}`}>
          {isImg ? (
            <img className="wp-media-img" src={item.url} alt={item.name || "imagen"} />
          ) : isPdf ? (
            <iframe className="wp-media-iframe" src={item.url} title="PDF" />
          ) : (
            <div className="wp-media-unknown">
              <p>📎 {item.name || "Archivo"}</p>
              <a href={item.url} target="_blank" rel="noreferrer">
                Abrir archivo
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MediaViewerModal;
