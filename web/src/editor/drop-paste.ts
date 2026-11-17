
export const filterImageFiles = (files: FileList | File[]): File[] => {
  return Array.from(files).filter(file =>
    file.type === '' || file.type.startsWith('image/')
  );
};

export const pasteImageFromClipboard = (e: ClipboardEvent): File[] => {
  const items = e.clipboardData?.items;
  if (!items) return [];

  const imageFiles: File[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) {
        imageFiles.push(file);
      }
    }
  }
  return imageFiles;
};