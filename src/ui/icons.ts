const SVG_NS = 'http://www.w3.org/2000/svg';

const ICON_PATHS = {
  archive: ['path:M21 8v13H3V8', 'path:M1 3h22v5H1z', 'path:M10 12h4'],
  back: ['path:m15 18-6-6 6-6'],
  bookmark: ['path:M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z'],
  check: ['path:m20 6-11 11-5-5'],
  chevron: ['path:m6 9 6 6 6-6'],
  document: [
    'path:M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
    'path:M14 2v6h6',
    'path:M8 13h8',
    'path:M8 17h6',
  ],
  menu: ['circle:12,5,1', 'circle:12,12,1', 'circle:12,19,1'],
  plus: ['path:M12 5v14', 'path:M5 12h14'],
  search: ['circle:11,11,8', 'path:m21 21-4.35-4.35'],
  trash: [
    'path:M3 6h18',
    'path:M8 6V4h8v2',
    'path:M19 6l-1 14H6L5 6',
    'path:M10 11v5',
    'path:M14 11v5',
  ],
  unarchive: ['path:M21 8v13H3V8', 'path:M1 3h22v5H1z', 'path:m9 15 3-3 3 3', 'path:M12 12v6'],
} as const;

export type IconName = keyof typeof ICON_PATHS;

export function createIcon(name: IconName, size = 18): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  ICON_PATHS[name].forEach((definition) => {
    const [kind, value] = definition.split(':', 2);
    if (kind === 'circle') {
      const [cx, cy, r] = value.split(',');
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', cx);
      circle.setAttribute('cy', cy);
      circle.setAttribute('r', r);
      circle.setAttribute('fill', 'currentColor');
      circle.setAttribute('stroke', 'none');
      svg.appendChild(circle);
      return;
    }
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', value);
    svg.appendChild(path);
  });
  return svg;
}

export function setButtonIcon(
  button: HTMLButtonElement,
  icon: IconName,
  label: string,
): void {
  button.replaceChildren(createIcon(icon));
  button.setAttribute('aria-label', label);
  button.title = label;
}
