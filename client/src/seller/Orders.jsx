import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../api.js';
import { Alert, Spinner, StatusBadge, STATUS_LABEL, amd, dateTime, useTitle } from '../components.jsx';

const TABS = ['placed', 'confirmed', 'shipped', 'delivered', 'cancelled'];

export default function Orders() {
  useTitle('Orders');
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setData(null);
    api.get('/seller/orders' + qs({ status })).then(setData).catch((e) => setErr(e.message));
  }, [status]);

  const all = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;
  return (
    <>
      <div className="tabs tabs-scroll">
        <button className={!status ? 'active' : ''} onClick={() => setParams({})}>All {data && <span className="count">{all}</span>}</button>
        {TABS.map((s) => (
          <button key={s} className={status === s ? 'active' : ''} onClick={() => setParams({ status: s })}>
            {STATUS_LABEL[s]} {data && <span className="count">{data.counts[s]}</span>}
          </button>
        ))}
      </div>
      <Alert>{err}</Alert>
      {!data ? <Spinner /> : data.orders.length === 0 ? (
        <div className="empty card"><p>No {status ? STATUS_LABEL[status].toLowerCase() : ''} orders.</p></div>
      ) : (
        <ul className="order-list">
          {data.orders.map((o) => (
            <li key={o.id}>
              <Link to={`/seller/orders/${o.id}`} className="card order-row">
                <div>
                  <div className="order-no">Order #{o.orderId}</div>
                  <div className="muted small">{dateTime(o.createdAt)} · {o.itemCount} {o.itemCount === 1 ? 'item' : 'items'}</div>
                </div>
                <div className="small">{o.recipient}<div className="muted">{o.city}, {o.region}</div></div>
                <StatusBadge status={o.status} />
                <div className="order-total">{amd(o.subtotalAmd)}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
