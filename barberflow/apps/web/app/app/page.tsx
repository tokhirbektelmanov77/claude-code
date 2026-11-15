'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@barberflow/ui';
import { useWorkspace } from '@/lib/workspace';

export default function CabinetIndex() {
  const { isManager } = useWorkspace();
  const router = useRouter();
  React.useEffect(() => { router.replace(isManager ? '/app/dashboard' : '/app/today'); }, [isManager, router]);
  return <div className="grid place-items-center py-20"><Spinner /></div>;
}
