export function supportsClosedBy(): boolean {
  return "closedBy" in HTMLDialogElement.prototype;
}

function isOutside(event: MouseEvent, dialog: HTMLDialogElement): boolean {
  const box = dialog.getBoundingClientRect();
  return (
    event.clientX < box.left ||
    event.clientX > box.right ||
    event.clientY < box.top ||
    event.clientY > box.bottom
  );
}

export function dismissOnOutsidePress(dialog: HTMLDialogElement): () => void {
  let pressedOutside = false;
  const onPointerDown = (event: PointerEvent) => {
    pressedOutside = isOutside(event, dialog);
  };
  const onPointerUp = (event: PointerEvent) => {
    if (pressedOutside && isOutside(event, dialog)) dialog.close();
    pressedOutside = false;
  };
  dialog.addEventListener("pointerdown", onPointerDown);
  dialog.addEventListener("pointerup", onPointerUp);
  return () => {
    dialog.removeEventListener("pointerdown", onPointerDown);
    dialog.removeEventListener("pointerup", onPointerUp);
  };
}
