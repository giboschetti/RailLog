'use client';

import React from 'react';
import ProjectSidebar from '@/components/dashboard/project-sidebar';

export default function ProjectLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  return (
    <div className="flex min-h-screen">
      <ProjectSidebar projectId={params.id} />
      <main className="flex-1 bg-gray-50">
        {children}
      </main>
    </div>
  );
} 