// Copyright (C) 2026 Quantrail™ Data Private Limited
// Author: Syed Ashiq
// Unit tests for AlertMarquee rendering, polling, message formatting,
// cluster fallback, and toggle visibility behavior.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockChart = { resize: vi.fn(), dispose: vi.fn() };

vi.mock('echarts', () => ({
    registerTheme: vi.fn(),
    getInstanceByDom: vi.fn(),
    init: vi.fn(),
}));

import * as echarts from 'echarts';

global.ResizeObserver = class {
    constructor(callback) {
        this.callback = callback;
        this.observe = vi.fn();
        this.disconnect = vi.fn();
    }
};

import { getThemeName, initChart, disposeChart, baseChartOption } from '../../src/frontend/utils/echarts.js';

beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.setAttribute('data-theme', 'light');
});

describe('echarts theme utility', () => {
    it('returns the light theme name when document theme is light', () => {
        document.documentElement.setAttribute('data-theme', 'light');
        expect(getThemeName()).toBe('chops-light');
    });

    it('returns the dark theme name when document theme is dark', () => {
        document.documentElement.setAttribute('data-theme', 'dark');
        expect(getThemeName()).toBe('chops-dark');
    });
});

describe('echarts chart helpers', () => {
    it('builds a base chart option with defaults and preserves shallow overrides', () => {
        const option = baseChartOption({ grid: { left: 10 }, xAxis: { type: 'category' } });
        expect(option.grid.left).toBe(10);
        expect(option.grid.top).toBeUndefined();
        expect(option.xAxis.type).toBe('category');
        expect(option.tooltip.trigger).toBe('axis');
    });

    it('initializes a chart and attaches a ResizeObserver', () => {
        const el = document.createElement('div');
        echarts.getInstanceByDom.mockReturnValue(null);
        echarts.init.mockReturnValue(mockChart);

        const chart = initChart(el);

        expect(echarts.getInstanceByDom).toHaveBeenCalledWith(el);
        expect(echarts.init).toHaveBeenCalledWith(el, 'chops-light', expect.objectContaining({ renderer: 'canvas' }));
        expect(el._ro).toBeInstanceOf(global.ResizeObserver);
        expect(el._ro.observe).toHaveBeenCalledWith(el);
        expect(chart).toBe(mockChart);
    });

    it('disposes an existing instance before initializing a new one', () => {
        const el = document.createElement('div');
        const existing = { dispose: vi.fn() };
        echarts.getInstanceByDom.mockReturnValue(existing);
        echarts.init.mockReturnValue(mockChart);

        initChart(el);

        expect(existing.dispose).toHaveBeenCalled();
    });

    it('disconnects observers and disposes chart instances on cleanup', () => {
        const el = document.createElement('div');
        el._ro = { disconnect: vi.fn() };
        echarts.getInstanceByDom.mockReturnValue(mockChart);

        disposeChart(el);

        expect(el._ro.disconnect).toHaveBeenCalled();
        expect(mockChart.dispose).toHaveBeenCalled();
    });

    it('does nothing when disposeChart receives a falsy element', () => {
        expect(() => disposeChart(null)).not.toThrow();
    });
});
