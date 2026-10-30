"use client";

import { Check, Clipboard, Copy, Download } from "lucide-react";
import { useState } from "react";

type AssetActionsProps = {
  src: string;
  filename: string;
  copyLabel?: string;
  linkToCopy?: string;
};

async function imageAsPng(src: string): Promise<Blob> {
  const response = await fetch(src);
  if (!response.ok) throw new Error("Asset konnte nicht geladen werden.");
  const blob = await response.blob();
  if (blob.type === "image/png") return blob;

  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Bild konnte nicht vorbereitet werden.");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((png) => png ? resolve(png) : reject(new Error("PNG konnte nicht erstellt werden.")), "image/png"));
}

export function AssetActions({ src, filename, copyLabel = "Bild kopieren", linkToCopy }: AssetActionsProps) {
  const [message, setMessage] = useState("");

  async function copyImage() {
    try {
      const image = imageAsPng(src);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": image })]);
      setMessage("Bild kopiert");
    } catch {
      setMessage("Kopieren nur über HTTPS möglich");
    }
  }

  async function copyLink() {
    if (!linkToCopy) return;
    try {
      await navigator.clipboard.writeText(linkToCopy);
      setMessage("Link kopiert");
    } catch {
      setMessage("Kopieren nicht verfügbar");
    }
  }

  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copyImage} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-emerald-400/60 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400">
          {message === "Bild kopiert" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copyLabel}
        </button>
        <a href={src} download={filename} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-emerald-400/60 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400">
          <Download className="h-4 w-4" />Download
        </a>
        {linkToCopy && <button type="button" onClick={copyLink} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-400/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400">
          <Clipboard className="h-4 w-4" />Link kopieren
        </button>}
      </div>
      <p aria-live="polite" className="min-h-5 text-xs text-slate-400">{message}</p>
    </div>
  );
}
