"use client";

import { ImagePlus } from "lucide-react";
import { type ChangeEvent, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// ~10 MB, validated client-side before upload; the server re-checks (ADR-0025).
const maxUploadBytes = 10 * 1024 * 1024;
const acceptAttribute = ".jpg,.jpeg,.png,.webp";
// Some browsers/OSes send `image/jpg` for `.jpg`; tolerate it alongside the
// canonical types, and fall back to the extension when a type is missing.
const allowedMediaTypes = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const allowedExtensions = /\.(jpe?g|png|webp)$/i;

/**
 * The "Upload your own image" trigger (ADR-0025): an icon-only ghost `ImagePlus`
 * button that opens a single-file picker for `.jpg/.jpeg/.png/.webp` and runs the
 * type/size check client-side before handing the file off — an over-cap or
 * unsupported file is rejected with a quiet toast, never a blocking dialog. It is
 * disabled while a generation is in flight so overlapping uploads can't start.
 */
export function UploadImageButton({
  disabled = false,
  onUpload,
}: {
  disabled?: boolean;
  onUpload: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so re-selecting the same file still fires `change`.
    event.target.value = "";

    if (!file) {
      return;
    }

    const isAllowedType =
      allowedMediaTypes.has(file.type.trim().toLowerCase()) || allowedExtensions.test(file.name);

    if (!isAllowedType) {
      toast.error("Use a JPG, PNG, or WebP image");

      return;
    }

    if (file.size > maxUploadBytes) {
      toast.error("That image is too large (max 10 MB)");

      return;
    }

    onUpload(file);
  }

  return (
    <>
      <input
        accept={acceptAttribute}
        aria-label="Upload your own image file"
        className="sr-only"
        onChange={handleChange}
        ref={inputRef}
        tabIndex={-1}
        type="file"
      />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label="Upload your own image"
              className="shrink-0 text-muted-foreground"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
              size="icon"
              type="button"
              variant="ghost"
            />
          }>
          <ImagePlus aria-hidden className="size-4" strokeWidth={1.75} />
        </TooltipTrigger>
        <TooltipContent>Upload your own image</TooltipContent>
      </Tooltip>
    </>
  );
}
