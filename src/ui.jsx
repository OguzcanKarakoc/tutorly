import React, { useMemo, useState } from 'react';

// Turns a "border-color: x; color: y;" declaration string into a React style object.
function parseCss(css) {
  const out = {};
  if (!css) return out;
  for (const decl of css.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    if (!prop) continue;
    out[prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = decl.slice(i + 1).trim();
  }
  return out;
}

// Merge a parsed hover declaration onto the base style. A hover `border-color`
// is folded into the base `border` shorthand instead of being layered on as a
// longhand: setting `borderColor` over a `border` shorthand and then dropping it
// on mouse-leave leaves the color at `currentColor` (the dark text color), so
// the border looks stuck dark. Rewriting the shorthand keeps both states on the
// same property, so React reverts it cleanly.
function mergeHover(style, hoverStyle) {
  const out = { ...style, ...hoverStyle };
  if (out.borderColor && typeof out.border === 'string') {
    const parts = out.border.trim().split(/\s+/);
    if (parts.length >= 3) {
      parts[parts.length - 1] = out.borderColor;
      out.border = parts.join(' ');
      delete out.borderColor;
    }
  }
  return out;
}

// Element with a hover style, mirroring the design template's style-hover attribute.
export function H({ as: Tag = 'div', hover, style, onMouseEnter, onMouseLeave, ...rest }) {
  const [hovered, setHovered] = useState(false);
  const hoverStyle = useMemo(() => parseCss(hover), [hover]);
  return (
    <Tag
      {...rest}
      style={hovered && hover ? mergeHover(style, hoverStyle) : style}
      onMouseEnter={(e) => { setHovered(true); if (onMouseEnter) onMouseEnter(e); }}
      onMouseLeave={(e) => { setHovered(false); if (onMouseLeave) onMouseLeave(e); }}
    />
  );
}

export function Svg({ size = 16, sw = 2, stroke = 'currentColor', style, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {children}
    </svg>
  );
}

export const IcnArrow = (p) => <Svg sw={2.4} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>;
export const IcnX = (p) => <Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>;
export const IcnTrash = (p) => (
  <Svg size={15} {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></Svg>
);
export const IcnChat = (p) => (
  <Svg size={14} {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></Svg>
);
export const IcnMenu = (p) => <Svg size={20} {...p}><path d="M3 12h18M3 6h18M3 18h18" /></Svg>;
