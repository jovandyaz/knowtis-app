import { useMutation } from '@tanstack/react-query';

import {
  imagesApi,
  type UploadImageArgs,
  type UploadImageResponse,
} from '@knowtis/api-client';

export function useUploadImage() {
  return useMutation<UploadImageResponse, Error, UploadImageArgs>({
    mutationFn: (args) => imagesApi.upload(args),
  });
}
