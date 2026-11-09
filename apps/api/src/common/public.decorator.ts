import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Skip the global JWT guard for this route. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
