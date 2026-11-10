import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import AssetsPage from './AssetsPage';
import { assetService } from '../services/assetService';

jest.mock('../services/assetService', () => ({ assetService: { search: jest.fn() } }));
jest.mock('../hooks/usePermissions', () => ({ usePermissions: () => ({ can: () => false }) }));
jest.mock('../components/assets/AssetThumbnail', () => () => null);

let scrollTo;
beforeEach(() => {
  assetService.search.mockClear();
  scrollTo = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => scrollTo.mockRestore());

function TestDetail() {
  const { state } = useLocation();
  return <Link to={state.from} state={{ restoreScroll: state.scrollY }}>Library</Link>;
}

test('filtering resets pagination, and opening an asset preserves its filtered library page', async () => {
  const user = userEvent.setup();
  assetService.search.mockImplementation(async ({ page, type }) => ({
    data: [{ id: page, originalname: type === 'image' ? `Sprite ${page}.png` : 'Asset.wav', mimetype: type === 'image' ? 'image/png' : 'audio/wav' }],
    totalItems: 30, totalPages: 3, currentPage: page,
  }));
  render(<MemoryRouter initialEntries={['/assets?page=3']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes><Route path="/assets" element={<AssetsPage />} /><Route path="/assets/:assetId" element={<TestDetail />} /></Routes>
  </MemoryRouter>);
  await screen.findByRole('link', { name: 'Open Asset.wav' });
  expect(assetService.search).toHaveBeenLastCalledWith({ page: 3, pageSize: 12 });

  await user.click(screen.getByRole('button', { name: 'Images' }));
  await screen.findByRole('link', { name: 'Open Sprite 1.png' });
  expect(assetService.search).toHaveBeenLastCalledWith({ page: 1, pageSize: 12, type: 'image' });
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.click(await screen.findByRole('link', { name: 'Open Sprite 2.png' }));

  const back = screen.getByRole('link', { name: 'Library' });
  expect(back).toHaveAttribute('href', '/assets?type=image&page=2');
  await user.click(back);
  await waitFor(() => expect(assetService.search).toHaveBeenLastCalledWith({ page: 2, pageSize: 12, type: 'image' }));
  expect(screen.getByRole('button', { name: 'Images' })).toHaveAttribute('aria-pressed', 'true');
});

test('library search and sort reset the page and survive opening an asset', async () => {
  const user = userEvent.setup();
  const previousScroll = window.scrollY;
  assetService.search.mockImplementation(async ({ page, filename, sort }) => ({
    data: [{ id: page, originalname: `${filename || 'All'} ${sort || 'newest'} ${page}.obj`, mimetype: 'model/obj' }],
    totalItems: 30, totalPages: 3, currentPage: page,
  }));
  try {
    render(<MemoryRouter initialEntries={['/assets?type=model&page=3']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes><Route path="/assets" element={<AssetsPage />} /><Route path="/assets/:assetId" element={<TestDetail />} /></Routes>
    </MemoryRouter>);
    await screen.findByRole('link', { name: 'Open All newest 3.obj' });
    const search = screen.getByRole('searchbox', { name: 'Search library' });
    await user.type(search, 'car');
    await screen.findByRole('link', { name: 'Open car newest 1.obj' });
    expect(assetService.search).toHaveBeenLastCalledWith({ page: 1, pageSize: 12, type: 'model', filename: 'car' });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('link', { name: 'Open car newest 2.obj' });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'size');
    await screen.findByRole('link', { name: 'Open car size 1.obj' });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    const asset = await screen.findByRole('link', { name: 'Open car size 2.obj' });
    window.scrollY = 240;
    await user.click(asset);
    const back = screen.getByRole('link', { name: 'Library' });
    expect(back).toHaveAttribute('href', '/assets?type=model&filename=car&sort=size&page=2');
    await user.click(back);
    await screen.findByRole('link', { name: 'Open car size 2.obj' });
    expect(assetService.search).toHaveBeenLastCalledWith({ page: 2, pageSize: 12, type: 'model', filename: 'car', sort: 'size' });
    expect(screen.getByRole('searchbox', { name: 'Search library' })).toHaveValue('car');
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toHaveValue('size');
    expect(screen.getByRole('button', { name: '3D models' })).toHaveAttribute('aria-pressed', 'true');
    expect(scrollTo).toHaveBeenCalledWith(0, 240);
  } finally {
    window.scrollY = previousScroll;
  }
});
