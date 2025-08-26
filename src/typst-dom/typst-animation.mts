export function triggerRipple(
  docRoot: Element,
  left: number,
  top: number,
  className: string,
  animation: string,
  color?: string
) {
  const ripple = document.createElement("div");

  ripple.className = className;
  ripple.style.left = left.toString() + "px";
  ripple.style.top = top.toString() + "px";
  ripple.style.position = "absolute";

  if (color) {
    ripple.style.border = `1px solid ${color}`;
  }

  docRoot.appendChild(ripple);

  // console.warn("ripple spawned on", docRoot)

  ripple.style.animation = animation;
  ripple.onanimationend = () => {
    docRoot.removeChild(ripple);
  };
}
