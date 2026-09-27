"use client"

export const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/webp,image/gif"

/**
 * Center-crop and downscale an image in the browser before uploading
 * (strips metadata such as EXIF location and keeps uploads tiny).
 * `fit: "cover"` crops to a square (avatars); "contain" keeps the aspect ratio (logos).
 */
export async function prepareImage(file: File, opts: { size?: number; fit?: "cover" | "contain" } = {}): Promise<File> {
  const size = opts.size ?? 256
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error("Use a PNG, JPEG, WebP or GIF image.")
  if (file.size > 15 * 1024 * 1024) throw new Error("That image is too large (max 15 MB).")
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Couldn't read that image.")
  })
  const canvas = document.createElement("canvas")
  let sx = 0
  let sy = 0
  let sw = bitmap.width
  let sh = bitmap.height
  if (opts.fit === "contain") {
    const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height))
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  } else {
    const side = Math.min(bitmap.width, bitmap.height)
    sx = (bitmap.width - side) / 2
    sy = (bitmap.height - side) / 2
    sw = sh = side
    canvas.width = canvas.height = Math.min(size, side)
  }
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Your browser can't process images.")
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9))
  const out = blob && blob.type === "image/webp" ? blob : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
  if (!out) throw new Error("Couldn't process that image.")
  const ext = out.type === "image/webp" ? "webp" : "png"
  return new File([out], `image.${ext}`, { type: out.type })
}
