import type { ReactNode } from 'react';
import { AdminLoginRequiredGuard } from '../../components/admin-login-required-guard';

export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <AdminLoginRequiredGuard />
      {children}
    </>
  );
}
