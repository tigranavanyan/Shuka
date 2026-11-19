import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useApp } from '../store.jsx';
import { Alert, Pagination, ProductCard, Spinner, useTitle } from '../components.jsx';

const SORTS = [
  ['newest', 'Newest'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['rating', 'Top rated'],
];

/** Filters and sort live in the URL so a search can be shared. */
export default function Search() {
  const [params, setParams] = useSearchParams();
  const { categories } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [minPrice, setMin] = useState(params.get('minPrice') || '');
  const [maxPrice, setMax] = useState(params.get('maxPrice') || '');
  const [showFilters, setShowFilters] = useState(false);

  const q = params.get('q') || '';
  const category = params.get('category') || '';
  const sort = params.get('sort') || 'newest';
  const page = Number(params.get('page') || 1);
  const catName = categories.find((c) => c.slug === category)?.name;
  useTitle(q ? `"${q}"` : catName || 'All products');

  useEffect(() => {
    setMin(params.get('minPrice') || '');
    setMax(params.get('maxPrice') || '');
    setData(null);
    setError('');
    api.get('/products' + qs({
      q, category, sort, page,
      minPrice: params.get('minPrice'), maxPrice: params.get('maxPrice'),
    })).then(setData).catch((e) => { setError(e.message); setData({ items: [], total: 0, pages: 1 }); });
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (changes) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) { if (v === '' || v == null) p.delete(k); else p.set(k, v); }
    if (!('page' in changes)) p.delete('page');
    setParams(p);
    window.scrollTo({ top: 0 });
  };

  const applyPrice = (e) => {
    e.preventDefault();
    update({ minPrice: minPrice.replace(/\D/g, ''), maxPrice: maxPrice.replace(/\D/g, '') });
    setShowFilters(false);
  };

  const heading = q ? <>Results for “{q}”{catName && <> in {catName}</>}</> : catName || 'All products';
  const hasFilters = q || category || params.get('minPrice') || params.get('maxPrice');

  return (
    <div className="container page">
      <div className="search-layout">
        <aside className={`filters card ${showFilters ? 'open' : ''}`}>
          <h3>Category</h3>
          <ul className="filter-list">
            <li><button className={!category ? 'active' : ''} onClick={() => update({ category: '' })}>All categories</button></li>
            {categories.map((c) => (
              <li key={c.id}>
                <button className={category === c.slug ? 'active' : ''} onClick={() => update({ category: c.slug })}>{c.name}</button>
              </li>
            ))}
          </ul>
          <h3>Price, AMD</h3>
          <form className="price-filter" onSubmit={applyPrice}>
            <input inputMode="numeric" placeholder="From" value={minPrice} onChange={(e) => setMin(e.target.value)} aria-label="Minimum price" />
            <span>–</span>
            <input inputMode="numeric" placeholder="To" value={maxPrice} onChange={(e) => setMax(e.target.value)} aria-label="Maximum price" />
            <button className="btn btn-light" type="submit">Go</button>
          </form>
          {hasFilters && <Link className="link-muted" to="/search" onClick={() => setShowFilters(false)}>Clear all filters</Link>}
        </aside>

        <section>
          <div className="results-head">
            <div>
              <h1 className="results-title">{heading}</h1>
              {data && <div className="muted">{data.total} {data.total === 1 ? 'result' : 'results'}</div>}
            </div>
            <div className="results-tools">
              <button className="btn btn-light show-sm" onClick={() => setShowFilters((s) => !s)}>Filters</button>
              <label className="sort">
                <span className="hide-sm">Sort by</span>
                <select value={sort} onChange={(e) => update({ sort: e.target.value })}>
                  {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            </div>
          </div>
          <Alert>{error}</Alert>
          {data === null ? <Spinner /> : data.items.length === 0 ? (
            <div className="empty card">
              <h2>No products found</h2>
              <p>Nothing matches your search and filters.</p>
              <Link to="/search" className="btn btn-primary">See all products</Link>
            </div>
          ) : (
            <>
              <div className="product-grid">
                {data.items.map((p) => <ProductCard key={p.id} p={p} />)}
              </div>
              <Pagination page={data.page} pages={data.pages} onPage={(n) => update({ page: n })} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
