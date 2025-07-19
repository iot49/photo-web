export function iconForFilename(fileName: string): string {
  // Get file extension (convert to lowercase for case-insensitive matching)
  const extension = fileName.split('.').pop()?.toLowerCase() || '';

  // Map file extensions to Bootstrap icon names
  const iconMap: { [key: string]: string } = {
    // Images
    jpg: 'image',
    jpeg: 'image',
    png: 'image',
    gif: 'image',
    bmp: 'image',
    svg: 'image',
    webp: 'image',
    ico: 'image',

    // Documents
    pdf: 'file-earmark-pdf',
    doc: 'file-earmark-word',
    docx: 'file-earmark-word',
    xls: 'file-earmark-excel',
    xlsx: 'file-earmark-excel',
    ppt: 'file-earmark-ppt',
    pptx: 'file-earmark-ppt',
    txt: 'file-earmark-text',
    rtf: 'file-earmark-text',

    // Code files
    js: 'file-earmark-code',
    ts: 'file-earmark-code',
    jsx: 'file-earmark-code',
    tsx: 'file-earmark-code',
    html: 'file-earmark-code',
    htm: 'file-earmark-code',
    css: 'file-earmark-code',
    scss: 'file-earmark-code',
    sass: 'file-earmark-code',
    less: 'file-earmark-code',
    json: 'file-earmark-code',
    xml: 'file-earmark-code',
    yaml: 'file-earmark-code',
    yml: 'file-earmark-code',
    py: 'file-earmark-code',
    java: 'file-earmark-code',
    cpp: 'file-earmark-code',
    c: 'file-earmark-code',
    h: 'file-earmark-code',
    cs: 'file-earmark-code',
    php: 'file-earmark-code',
    rb: 'file-earmark-code',
    go: 'file-earmark-code',
    rs: 'file-earmark-code',
    swift: 'file-earmark-code',
    kt: 'file-earmark-code',
    scala: 'file-earmark-code',
    sh: 'file-earmark-code',
    bat: 'file-earmark-code',
    ps1: 'file-earmark-code',

    // Archives
    zip: 'file-earmark-zip',
    rar: 'file-earmark-zip',
    '7z': 'file-earmark-zip',
    tar: 'file-earmark-zip',
    gz: 'file-earmark-zip',
    bz2: 'file-earmark-zip',

    // Audio
    mp3: 'file-earmark-music',
    wav: 'file-earmark-music',
    flac: 'file-earmark-music',
    aac: 'file-earmark-music',
    ogg: 'file-earmark-music',
    m4a: 'file-earmark-music',

    // Video
    mp4: 'file-earmark-play',
    avi: 'file-earmark-play',
    mkv: 'file-earmark-play',
    mov: 'file-earmark-play',
    wmv: 'file-earmark-play',
    flv: 'file-earmark-play',
    webm: 'file-earmark-play',

    // Data files
    csv: 'table',
    sql: 'database',
    db: 'database',
    sqlite: 'database',

    // Configuration files
    ini: 'gear',
    conf: 'gear',
    config: 'gear',
    cfg: 'gear',
    toml: 'gear',

    // Markdown and documentation
    md: 'file-earmark-text',
    markdown: 'file-earmark-text',
    rst: 'file-earmark-text',
    adoc: 'file-earmark-text',

    // Font files
    ttf: 'fonts',
    otf: 'fonts',
    woff: 'fonts',
    woff2: 'fonts',
    eot: 'fonts',
  };

  // Return the mapped icon or a default file icon
  return iconMap[extension] || 'file-earmark';
}
