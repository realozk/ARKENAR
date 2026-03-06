import { useEffect, useRef, memo } from "react";

interface Star {
    x: number;
    y: number;
    size: number;
    opacity: number;
    speed: number;
}

export const Starfield = memo(() => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let animationFrameId: number;
        let stars: Star[] = [];

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            initStars();
        };

        const initStars = () => {
            const count = Math.floor((canvas.width * canvas.height) / 10000);
            stars = Array.from({ length: count }, () => ({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 1.5 + 0.5,
                opacity: Math.random() * 0.5 + 0.2,
                speed: Math.random() * 0.05 + 0.02,
            }));
        };

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const theme = document.documentElement.getAttribute('data-theme') || 'dark';
            const isLight = theme.toLowerCase() === 'light';
            const starColor = isLight ? '0, 0, 0' : '255, 255, 255';

            const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || "rgba(0, 213, 190, 1)";


            // Draw subtle glow in corners
            const gradient = ctx.createRadialGradient(
                canvas.width * 0.5, canvas.height * 0.5, 0,
                canvas.width * 0.5, canvas.height * 0.5, canvas.width * 0.8
            );
            gradient.addColorStop(0, "transparent");
            // If it's a hex, we use it directly with low opacity; otherwise fallback
            gradient.addColorStop(1, accentColor.startsWith('#') ? `${accentColor}11` : "rgba(0, 213, 190, 0.03)");
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            stars.forEach((star) => {
                // Increase opacity and size for light mode stars to ensure visibility
                const opacity = isLight ? star.opacity * 1.5 : star.opacity;
                const size = isLight ? star.size * 1.2 : star.size;

                ctx.fillStyle = `rgba(${starColor}, ${opacity})`;
                ctx.beginPath();
                ctx.arc(star.x, star.y, size, 0, Math.PI * 2);
                ctx.fill();



                // Update position
                star.y -= star.speed;
                if (star.y < 0) {
                    star.y = canvas.height;
                    star.x = Math.random() * canvas.width;
                }

                // Twinkle effect
                star.opacity += (Math.random() - 0.5) * 0.01;
                star.opacity = Math.max(0.1, Math.min(0.7, star.opacity));
            });

            animationFrameId = requestAnimationFrame(draw);
        };

        window.addEventListener("resize", resize);
        resize();
        draw();

        return () => {
            window.removeEventListener("resize", resize);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className={`fixed inset-0 pointer-events-none z-0 transition-opacity duration-1000 ${document.documentElement.getAttribute('data-theme')?.toLowerCase() === 'light' ? 'opacity-80' : 'opacity-40'}`}
            style={{ filter: "blur(0.5px)" }}
        />

    );
});

export const Aurora = memo(() => {
    return (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden opacity-30 select-none">
            <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-accent/10 blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
            <div className="absolute -bottom-[20%] -right-[10%] w-[50%] h-[50%] rounded-full bg-status-info/5 blur-[100px] animate-pulse" style={{ animationDuration: '12s' }} />
        </div>
    );
});
