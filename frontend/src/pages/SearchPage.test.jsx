import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SearchPage from './SearchPage';
import { assetService } from '../services/assetService';

jest.mock('../services/assetService', () => ({ assetService: { search: jest.fn() } }));
jest.mock('../components/assets/AssetGrid', () => ({
  __esModule: true,
  default: ({ assets }) => <div>{assets.map((asset) => <span key={asset.id}>{asset.originalname}</span>)}</div>,
  AssetGridSkeleton: () => <div>Loading results</div>,
}));

beforeEach(() => jest.clearAllMocks());

test('requests and displays subsequent search result pages with the active filters', async () => {
  assetService.search
    .mockResolvedValueOnce({ data: [{ id: 1, originalname: 'hero-one.png' }], totalItems: 25, currentPage: 1, totalPages: 2 })
    .mockResolvedValueOnce({ data: [{ id: 2, originalname: 'hero-two.png' }], totalItems: 25, currentPage: 2, totalPages: 2 });

  render(
    <MemoryRouter initialEntries={['/search?filename=hero']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes><Route path="/search" element={<SearchPage />} /></Routes>
    </MemoryRouter>,
  );

  expect(await screen.findByText('hero-one.png')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByText('hero-two.png')).toBeInTheDocument();

  await waitFor(() => expect(assetService.search).toHaveBeenLastCalledWith(expect.objectContaining({ filename: 'hero', page: 2, pageSize: 24 })));
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
});

test('maps the AI metadata field to the canonical q backend parameter', async () => {
  assetService.search.mockResolvedValue({ data: [], totalItems: 0, currentPage: 1, totalPages: 1 });

  render(
    <MemoryRouter initialEntries={['/search']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes><Route path="/search" element={<SearchPage />} /></Routes>
    </MemoryRouter>,
  );

  fireEvent.change(screen.getByLabelText('AI metadata'), { target: { value: 'redis' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search assets' }));

  await waitFor(() => expect(assetService.search).toHaveBeenCalledWith(expect.objectContaining({ q: 'redis', page: 1, pageSize: 24 })));
});

test('reset ignores results that arrive from an earlier search', async () => {
  let resolveSearch;
  assetService.search.mockReturnValue(new Promise(resolve => { resolveSearch = resolve; }));
  render(<MemoryRouter initialEntries={['/search?filename=old']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><SearchPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  await act(async () => resolveSearch({ data: [{ id: 1, originalname: 'late-result.png' }], totalItems: 1 }));
  expect(screen.queryByText('late-result.png')).not.toBeInTheDocument();
  expect(screen.getByText('Build a precise search')).toBeInTheDocument();
});

test('request failures show retry without a misleading empty-result message', async () => {
  assetService.search.mockRejectedValue(new Error('Offline'));
  render(<MemoryRouter initialEntries={['/search?filename=hero']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><SearchPage /></MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Search could not be completed.');
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  expect(screen.queryByText('No matching assets')).not.toBeInTheDocument();
});
