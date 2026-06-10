export async function copyTextToClipboard(text: string): Promise<boolean> {
  // Clipboard access can be missing or denied in automated or locked-down browsers.
  if (!navigator.clipboard) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
