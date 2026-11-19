import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { AppProvider, useApp } from './store.jsx';
import { Header, Footer, Spinner } from './components.jsx';
import './styles.css';

import Home from './pages/Home.jsx';
import Search from './pages/Search.jsx';
import Product from './pages/Product.jsx';
import Cart from './pages/Cart.jsx';
import Checkout from './pages/Checkout.jsx';
import MyOrders from './pages/MyOrders.jsx';
import OrderDetail from './pages/OrderDetail.jsx';
import { Login, Register } from './pages/Auth.jsx';
import Account from './pages/Account.jsx';
import BecomeSeller from './pages/BecomeSeller.jsx';
import SellerLayout from './seller/SellerLayout.jsx';
import Overview from './seller/Overview.jsx';
import SellerProducts from './seller/Products.jsx';
import ProductEditor from './seller/ProductEditor.jsx';
import SellerOrders from './seller/Orders.jsx';
import SellerOrderDetail from './seller/OrderDetail.jsx';

/** Client-side guard for UX only — the server checks every request. */
function RequireUser({ children, seller }) {
  const { user } = useApp();
  const loc = useLocation();
  if (user === undefined) return <div className="container page"><Spinner /></div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (seller && !user.isSeller) return <Navigate to="/sell" replace />;
  return children;
}

function NotFound() {
  return (
    <div className="container page empty">
      <h1>Page not found</h1>
      <p>The page you are looking for does not exist.</p>
      <Link className="btn btn-primary" to="/">Back to Shuka</Link>
    </div>
  );
}

function App() {
  return (
    <>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/p/:id" element={<Product />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/cart" element={<RequireUser><Cart /></RequireUser>} />
          <Route path="/checkout" element={<RequireUser><Checkout /></RequireUser>} />
          <Route path="/orders" element={<RequireUser><MyOrders /></RequireUser>} />
          <Route path="/orders/:id" element={<RequireUser><OrderDetail /></RequireUser>} />
          <Route path="/account" element={<RequireUser><Account /></RequireUser>} />
          <Route path="/sell" element={<RequireUser><BecomeSeller /></RequireUser>} />
          <Route path="/seller" element={<RequireUser seller><SellerLayout /></RequireUser>}>
            <Route index element={<Overview />} />
            <Route path="products" element={<SellerProducts />} />
            <Route path="products/new" element={<ProductEditor />} />
            <Route path="products/:id" element={<ProductEditor />} />
            <Route path="orders" element={<SellerOrders />} />
            <Route path="orders/:id" element={<SellerOrderDetail />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
