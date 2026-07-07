import { JarvisShell } from '@/components/jarvis/JarvisShell';
import { AuthGate } from '@/components/AuthGate';

export default function Home() {
  return (
    <AuthGate>
      <JarvisShell />
    </AuthGate>
  );
}
