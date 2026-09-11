import { Brand } from './AppLayout';
import Icon from '../ui/Icon';

export default function AuthLayout({ title, description, icon = 'lock', children }) {
  return <main className="login-page">
    <section className="login-brand-panel"><Brand /><div className="login-statement"><span className="eyebrow">ARENA FUTSAL SYSTEM</span><h1>Todo tu torneo.<br /><span>En un solo lugar.</span></h1><p>La organización también juega.<br />Gestiona tus campeonatos desde el primer encuentro.</p><div className="login-feature"><Icon name="trophy" size={23} /><span>Campeonatos y gestión deportiva</span></div></div><small>ARENA FUTSAL SYSTEM · GESTIÓN DEPORTIVA</small></section>
    <section className="login-form-panel"><div className="login-form-box"><span className="login-lock"><Icon name={icon} size={25} /></span><span className="eyebrow">ARENA FUTSAL SYSTEM</span><h2>{title}</h2><p>{description}</p>{children}</div></section>
  </main>;
}
