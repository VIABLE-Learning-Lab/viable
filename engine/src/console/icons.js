/**
 * The console's icons: one stroke, one weight, in the text's color. Drawn here so a page needs nothing from elsewhere. No Node built-ins.
 */
const PATHS = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  copy: 'M9 9h10.5v10.5H9zM15 9V4.5H4.5V15H9',
  help: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 0 0 0-17zM9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.7M12 16.6v.4',
  gauge: 'M4 15.5a8 8 0 1 1 16 0M12 15.5l3.5-4.5M4 15.5h2M18 15.5h2M12 7.5v1.5',
  platform: 'M4 5h16v11H4zM8.5 20h7M12 16v4',
  signout: 'M14 4.5h4.5v15H14M10 8l-4 4l4 4M6 12h9',
  server: 'M4.5 4.5h15v6h-15zM4.5 13.5h15v6h-15zM8 7.5h.01M8 16.5h.01',
  unseen: 'M4 4l16 16M10.6 6.1A9.4 9.4 0 0 1 12 6c5 0 8.5 4.6 9 6c-.3.9-1.4 2.6-3.1 4.1M6.5 7.6C4.6 9 3.3 10.8 3 12c.5 1.4 4 6 9 6c1.7 0 3.2-.5 4.5-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2',
  'thumb-up': 'M7.5 10.5v9h-3v-9zM7.5 10.5l3.6-6.4a1.7 1.7 0 0 1 3.1 1.2l-.7 3.7h5.2a1.8 1.8 0 0 1 1.8 2.1l-1.3 6.6a1.8 1.8 0 0 1-1.8 1.8H7.5',
  'thumb-down': 'M7.5 13.5v-9h-3v9zM7.5 13.5l3.6 6.4a1.7 1.7 0 0 0 3.1-1.2l-.7-3.7h5.2a1.8 1.8 0 0 0 1.8-2.1l-1.3-6.6a1.8 1.8 0 0 0-1.8-1.8H7.5',
  retry: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.2h-4.2',
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
  grip: 'M8 6.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0M14 6.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0M8 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0M14 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0M8 17.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0M14 17.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
  more: 'M5 12a1.25 1.25 0 1 0 2.5 0a1.25 1.25 0 1 0-2.5 0M10.75 12a1.25 1.25 0 1 0 2.5 0a1.25 1.25 0 1 0-2.5 0M16.5 12a1.25 1.25 0 1 0 2.5 0a1.25 1.25 0 1 0-2.5 0',
  pencil: 'M15.5 5.5l3 3L8 19l-3.8.8L5 16z',
  bold: 'M7.5 5h5.25a3.25 3.25 0 0 1 0 6.5H7.5zM7.5 11.5h6a3.5 3.5 0 0 1 0 7h-6z',
  italic: 'M10.5 5h7M6.5 19h7M14.5 5l-4.5 14',
  heading: 'M6 5v14M18 5v14M6 12h12',
  subheading: 'M8 9v10M16 9v10M8 14h8',
  list: 'M10 7h9.5M10 12h9.5M10 17h9.5M4.1 7a.9.9 0 1 0 1.8 0a.9.9 0 1 0-1.8 0M4.1 12a.9.9 0 1 0 1.8 0a.9.9 0 1 0-1.8 0M4.1 17a.9.9 0 1 0 1.8 0a.9.9 0 1 0-1.8 0',
  numbered: 'M11 8h8.5M11 16h8.5M5.5 6.25l1.25-.75v5M4.75 14.6a1.4 1.4 0 1 1 2.4 1L4.75 18.5h2.75',
  quote: 'M5 5v14M9.5 7h10M9.5 12h10M9.5 17h6'
};

/** An icon as inline SVG: decoration, so what it stands beside says what it means. */
export const icon = (name, size = 18) => `<svg class="v-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${PATHS[name]}"/></svg>`;
