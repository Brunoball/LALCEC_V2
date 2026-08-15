import React, { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFilePdf,
  faMicrophone,
  faPause,
  faPlay,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  fmtBytes,
  fmtDateKey,
  fmtFechaSeparador,
  fmtHora,
  inferMimeFromUrl,
  isAudioMime,
  isImageMime,
  isPdfMime,
  mapEmisorToSide,
} from "../utils/botPanelUtils";

const AUDIO_WAVE = [
  6, 11, 17, 10, 21, 14, 24, 11, 18, 26,
  13, 9, 19, 15, 28, 12, 17, 23, 10, 20,
  14, 8, 22, 16, 27, 11, 19, 13, 24, 10,
  18, 12, 26, 15, 20, 9, 23, 14, 17, 11,
];

const formatAudioTime = (seconds) => {
  const safe = Number.isFinite(Number(seconds)) ? Math.max(0, Number(seconds)) : 0;
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
};

const AudioMessage = ({ src, mime, name, size, side = "left" }) => {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const pauseWhenAnotherStarts = (event) => {
      const audio = audioRef.current;
      if (!audio || event?.detail === audio || audio.paused) return;
      audio.pause();
    };

    window.addEventListener("botpanel:audio-play", pauseWhenAnotherStarts);
    return () => window.removeEventListener("botpanel:audio-play", pauseWhenAnotherStarts);
  }, []);

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setFailed(false);
  }, [src]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audio.paused) {
      audio.pause();
      return;
    }

    window.dispatchEvent(new CustomEvent("botpanel:audio-play", { detail: audio }));

    try {
      await audio.play();
    } catch {
      setFailed(true);
      setPlaying(false);
    }
  };

  const seekTo = (event) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const next = Number(event.target.value);
    audio.currentTime = Number.isFinite(next) ? next : 0;
    setCurrentTime(audio.currentTime);
  };

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const displayTime = duration > 0
    ? formatAudioTime(playing || currentTime > 0 ? currentTime : duration)
    : "0:00";

  if (failed) {
    return (
      <div className="wp-audio-card wp-audio-card--error">
        <div className="wp-audio-error-icon" aria-hidden="true">
          <FontAwesomeIcon icon={faMicrophone} />
        </div>
        <div className="wp-audio-error-copy">
          <strong>Audio recibido</strong>
          <span>No se pudo reproducir en el navegador.</span>
        </div>
        <a className="wp-audio-open" href={src} target="_blank" rel="noreferrer">
          Abrir
        </a>
      </div>
    );
  }

  return (
    <div className={`wp-audio-card wp-audio-card--${side}`} title={name || "Audio recibido"}>
      <audio
        ref={audioRef}
        className="wp-audio-native"
        preload="metadata"
        onLoadedMetadata={(event) => {
          const nextDuration = Number(event.currentTarget.duration);
          setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
        }}
        onDurationChange={(event) => {
          const nextDuration = Number(event.currentTarget.duration);
          if (Number.isFinite(nextDuration)) setDuration(nextDuration);
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
        onError={() => setFailed(true)}
      >
        <source src={src} type={mime || undefined} />
      </audio>

      <button
        type="button"
        className="wp-audio-play"
        onClick={togglePlay}
        aria-label={playing ? "Pausar audio" : "Reproducir audio"}
        title={playing ? "Pausar" : "Reproducir"}
      >
        <FontAwesomeIcon icon={playing ? faPause : faPlay} />
      </button>

      <div className="wp-audio-center">
        <div
          className="wp-audio-wave-wrap"
          style={{ "--wp-audio-progress": `${progress}%` }}
        >
          <div className="wp-audio-wave" aria-hidden="true">
            {AUDIO_WAVE.map((height, index) => {
              const played = ((index + 1) / AUDIO_WAVE.length) * 100 <= progress;
              return (
                <span
                  key={`wave-${index}`}
                  className={played ? "is-played" : ""}
                  style={{ height: `${height}px` }}
                />
              );
            })}
          </div>
          <input
            className="wp-audio-seek"
            type="range"
            min="0"
            max={duration > 0 ? duration : 0}
            step="0.01"
            value={duration > 0 ? Math.min(currentTime, duration) : 0}
            onChange={seekTo}
            aria-label="Posición del audio"
          />
        </div>

        <div className="wp-audio-meta">
          <span>{displayTime}</span>
        </div>
      </div>
    </div>
  );
};

const BotMessageList = ({
  errorMsgs,
  mensajes,
  messagesRef,
  msgEndRef,
  openViewer,
}) => (
  <div className="wp-messages" ref={messagesRef}>
    <div className="wp-day">
      <span>Mensajes</span>
    </div>

    {errorMsgs ? (
      <div className="wp-error wp-error--inchat">
        <FontAwesomeIcon icon={faTriangleExclamation} />
        <span>{errorMsgs}</span>
      </div>
    ) : null}

    {(mensajes || []).map((m, idx) => {
      const prev = idx > 0 ? mensajes[idx - 1] : null;
      const showDateSeparator = !prev || fmtDateKey(prev.ts) !== fmtDateKey(m.ts);
      const side = mapEmisorToSide(m.emisor);
      const prioridadMsg = String(m.prioridad || "normal").toLowerCase();

      const isPendingConsult =
        m.es_consulta === true &&
        m.consulta_atendida === false;

      const danger =
        String(m.text || "").startsWith("ERROR") ||
        (prioridadMsg === "alta" && !isPendingConsult);

      const hasMedia = !!m.media_url;
      const mime = m.media_mime || (m.media_url ? inferMimeFromUrl(m.media_url) : "");
      const showImg = hasMedia && isImageMime(mime);
      const showPdf = hasMedia && isPdfMime(mime);
      const showAudio =
        hasMedia &&
        (isAudioMime(mime) ||
          /\/usuarios\/audios\//i.test(String(m.media_url || "")) ||
          /^audio_/i.test(String(m.media_name || "")));

      // Algunos mensajes de documentos llegan con una leyenda técnica tipo
      // "[pdf]archivo.pdf" además del adjunto. WhatsApp no muestra ese texto
      // duplicado, así que lo ocultamos únicamente cuando coincide con el archivo.
      const rawText = String(m.text || "").trim();
      const mediaName = String(m.media_name || "").trim();
      const pdfMarkerMatch = rawText.match(/^\[pdf\]\s*(.+)$/i);
      const hidePdfMarker =
        showPdf &&
        pdfMarkerMatch &&
        (!mediaName || pdfMarkerMatch[1].trim().toLowerCase() === mediaName.toLowerCase());
      const hideAudioMarker = showAudio && /^🎧?\s*audio recibido\s*$/iu.test(rawText);
      const visibleText = hidePdfMarker || hideAudioMarker ? "" : m.text;

      const pdfPreviewUrl = showPdf
        ? `${m.media_url}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH`
        : "";

      const openPdf = () =>
        openViewer({
          url: m.media_url,
          mime,
          name: m.media_name || "documento.pdf",
        });

      return (
        <React.Fragment key={m.id}>
          {showDateSeparator ? (
            <div className="wp-date-separator">
              <span>{fmtFechaSeparador(m.ts)}</span>
            </div>
          ) : null}

          <div className={`wp-msg wp-msg--${side}`}>
            <div
              className={`wp-bubble ${danger ? "wp-bubble--danger" : ""} ${
                isPendingConsult ? "wp-bubble--consulta" : ""
              }`}
            >
              {isPendingConsult ? (
                <span
                  className="wp-consulta-pill"
                  title="Consulta pendiente de respuesta"
                >
                  👩‍💼 Consulta pendiente
                </span>
              ) : null}

              {hasMedia ? (
                <div className="wp-media-inbubble">
                  {showImg ? (
                    <button
                      type="button"
                      className="wp-media-thumbbtn"
                      onClick={() =>
                        openViewer({
                          url: m.media_url,
                          mime,
                          name: m.media_name || "imagen",
                        })
                      }
                      title="Ver imagen"
                    >
                      <img
                        className="wp-media-thumb"
                        src={m.media_url}
                        alt={m.media_name || "imagen"}
                      />
                    </button>
                  ) : showPdf ? (
                    <div
                      className="wp-doc-card"
                      role="button"
                      tabIndex={0}
                      onClick={openPdf}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openPdf();
                        }
                      }}
                      title="Ver PDF"
                      aria-label={`Abrir ${m.media_name || "Documento PDF"}`}
                    >
                      <div className="wp-doc-preview" aria-hidden="true">
                        <div className="wp-doc-preview-fallback">
                          <div className="wp-doc-preview-sheet">
                            <span className="wp-doc-preview-line wp-doc-preview-line--title" />
                            <span className="wp-doc-preview-line" />
                            <span className="wp-doc-preview-line" />
                            <span className="wp-doc-preview-line wp-doc-preview-line--short" />
                          </div>
                        </div>
                        <iframe
                          className="wp-doc-preview-frame"
                          src={pdfPreviewUrl}
                          title=""
                          loading="lazy"
                          scrolling="no"
                          tabIndex={-1}
                        />
                        <span className="wp-doc-preview-badge">PDF</span>
                      </div>

                      <div className="wp-doc-info">
                        <div className="wp-doc-ico">
                          <FontAwesomeIcon icon={faFilePdf} />
                        </div>
                        <div className="wp-doc-meta">
                          <div className="wp-doc-name">
                            {m.media_name || "Documento PDF"}
                          </div>
                          <div className="wp-doc-sub">
                            PDF {m.media_size ? `• ${fmtBytes(m.media_size)}` : ""}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : showAudio ? (
                    <AudioMessage
                      src={m.media_url}
                      mime={mime || "audio/ogg"}
                      name={m.media_name || "Audio recibido"}
                      size={m.media_size}
                      side={side}
                    />
                  ) : (
                    <a href={m.media_url} target="_blank" rel="noreferrer">
                      📎 {m.media_name || "Archivo"}{" "}
                      {m.media_size ? `(${fmtBytes(m.media_size)})` : ""}
                    </a>
                  )}
                </div>
              ) : null}

              {visibleText ? <div className="wp-bubble-text">{visibleText}</div> : null}

              <div className="wp-bubble-time">
                {fmtHora(m.ts)} • {m.emisor}
              </div>
            </div>
          </div>
        </React.Fragment>
      );
    })}

    <div ref={msgEndRef} />
  </div>
);

export default BotMessageList;
