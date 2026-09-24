import { IMAGE_MIME_TYPES } from '@knowtis/shared-util';

export function openImagePicker(onPick: (file: File) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = IMAGE_MIME_TYPES.join(',');
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) {
      onPick(file);
    }
  };
  input.click();
}
