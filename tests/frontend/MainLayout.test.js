import { describe, it, expect } from 'vitest';
import fs from 'fs';

const code = fs.readFileSync('src/frontend/components/layout/MainLayout.jsx', 'utf8');

describe('MainLayout source wiring', () => {
    it('includes the top-level app shell providers and layout pieces', () => {
        expect(code).toContain('ToastProvider');
        expect(code).toContain('Navbar');
        expect(code).toContain('Sidebar');
        expect(code).toContain('GlobalSearch');
        expect(code).toContain('AlertMarquee');
        expect(code).toContain('ErrorBoundary');
    });

    it('owns the searchOpen state and passes it into GlobalSearch', () => {
        expect(code).toContain('const [searchOpen, setSearchOpen] = useState(false);');
        expect(code).toContain('<GlobalSearch');
        expect(code).toContain('open={searchOpen}');
        expect(code).toContain('onClose={() => setSearchOpen(false)}');
    });

    it('declares the core route list including overview/cluster and editor/query', () => {
        expect(code).toContain('["overview/cluster", ClusterOverview]');
        expect(code).toContain('["editor/query", SqlEditorPage]');
    });

    it('navigates by prefixing routes with a slash and collapses the sidebar', () => {
        expect(code).toContain('function handleNavigate(r)');
        expect(code).toContain('navigate("/" + r);');
        expect(code).toContain('if (!r.startsWith("editor/")) setSidebarCollapsed(false);');
    });
});
