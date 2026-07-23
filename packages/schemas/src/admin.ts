import { z } from 'zod';
import { idSchema } from './common';

export const adminMembershipUpdateSchema = z.object({
  ldpassUserId: idSchema,
  role: z.enum(['admin', 'super_admin']),
  status: z.enum(['active', 'suspended']),
});

export type AdminMembershipUpdateInput = z.infer<typeof adminMembershipUpdateSchema>;
