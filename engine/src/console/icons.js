/**
 * The console's icons: one stroke, one weight, in the text's color. Drawn here so a page needs nothing from elsewhere. No Node built-ins.
 */
const PATHS = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 8v5M12 16.5v.5M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 0 0 0-17z',
  chevron: 'M6.5 9.5L12 15l5.5-5.5',
  trash: 'M5 7h14M10 7V4.5h4V7M7 7l.8 12.5h8.4L17 7M10.5 11v5M13.5 11v5',
  plus: 'M12 5.5v13M5.5 12h13',
  send: 'M12 19V5.5M6 11.5l6-6l6 6',
  stop: 'M8 8h8v8H8z',
  mic: 'M12 3.5a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0v-5a3 3 0 0 0-3-3zM6 11.5a6 6 0 0 0 12 0M12 17.5v3',
  file: 'M6.5 3.5h7l4 4v13h-11zM13.5 3.5v4h4',
  link: 'M10 14a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1-1',
  course: 'M5 5.5a2 2 0 0 1 2-2h12v15H7a2 2 0 0 0-2 2zM5 20.5a2 2 0 0 0 2 2h12v-4',
  close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  out: 'M8 16L16.5 7.5M9 7.5h7.5V15',
  upload: 'M12 15.5V5M7.5 9.5L12 5l4.5 4.5M5 15v4.5h14V15',
  drive: 'M9 4h6l6 10.5l-3 5.5H6l-3-5.5zM9 4l6 10.5H3M15 4L6 20',
  folder: 'M3.5 6.5a1.5 1.5 0 0 1 1.5-1.5h4.2l2 2.2H19a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z',
  inbox: 'M4 13.5l2.2-8h11.6l2.2 8v5.5H4zM4 13.5h4.5l1.2 2.2h4.6l1.2-2.2H20',
  undo: 'M8.5 6.5L4.5 10.5l4 4M4.5 10.5H15a4.5 4.5 0 0 1 0 9h-3',
  redo: 'M15.5 6.5l4 4l-4 4M19.5 10.5H9a4.5 4.5 0 0 0 0 9h3',
  memory: 'M7.5 4.5h9a1 1 0 0 1 1 1V20l-5.5-3.5L6.5 20V5.5a1 1 0 0 1 1-1z',
  pencil: 'M15.5 5.5l3 3L8 19l-3.8.8L5 16z'
};

/** An icon as inline SVG: decoration, so what it stands beside says what it means. */
export const icon = (name, size = 18) => `<svg class="v-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${PATHS[name]}"/></svg>`;
