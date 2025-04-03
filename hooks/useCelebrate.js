// hooks/useCelebrate.js
import dynamic from 'next/dynamic';

const confetti = dynamic(() => import('canvas-confetti'), { ssr: false });

export const triggerConfetti = () => {
  if (typeof window !== 'undefined') {
    import('canvas-confetti').then((confetti) => {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    });
  }
};
