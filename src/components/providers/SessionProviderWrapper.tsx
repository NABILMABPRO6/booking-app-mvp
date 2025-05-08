// src/components/providers/SessionProviderWrapper.tsx
'use client'; // Mark this component as a Client Component

import { SessionProvider } from 'next-auth/react';
import React from 'react';

interface Props {
    children: React.ReactNode;
    // You can pass the session object from the server if needed for initial load,
    // but often SessionProvider handles fetching it automatically.
    // session?: any;
}

export default function SessionProviderWrapper({ children }: Props) {
    // The SessionProvider component from next-auth/react handles
    // fetching and providing the session context.
    return <SessionProvider>{children}</SessionProvider>;
}