import { ACCEPTED_IMAGE_TYPES } from '@knowtis/editor';

export function openImagePicker(onPick: (file: File) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = ACCEPTED_IMAGE_TYPES.join(',');
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) {
      onPick(file);
    }
  };
  input.click();
}
