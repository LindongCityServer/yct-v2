import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminLoginRequiredGuard } from '../../components/admin-login-required-guard';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <AdminLoginRequiredGuard />
      {children}
    </>
  );
}
