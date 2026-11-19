import { NavLink, Outlet } from 'react-router-dom';
import { useApp } from '../store.jsx';

export default function SellerLayout() {
  const { user } = useApp();
  return (
    <div className="container page">
      <div className="seller-head">
        <div>
          <div className="muted small">Seller dashboard</div>
          <h1 className="seller-store">{user.storeName}</h1>
        </div>
        <nav className="tabs">
          <NavLink end to="/seller">Overview</NavLink>
          <NavLink to="/seller/products">Products</NavLink>
          <NavLink to="/seller/orders">Orders</NavLink>
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
