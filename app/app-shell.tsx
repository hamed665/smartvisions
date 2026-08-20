'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const groups = [
  ['Sales', [['Dashboard','/'],['Hunters','/hunters'],['Leads','/leads'],['Intent Leads','/intent-leads'],['Campaigns','/campaigns'],['Conversations','/conversations'],['Hot Leads','/hot-leads']]],
  ['Growth', [['Outreach','/outreach'],['Message Studio','/messages'],['Automations','/automations'],['Approvals','/approvals'],['Portfolio','/portfolio'],['Preview Studio','/preview-studio']]],
  ['Control', [['Services','/services'],['Pricing','/pricing'],['Markets','/markets'],['AI Agents','/agents'],['Knowledge Base','/knowledge'],['Integrations','/integrations'],['Suppression / DNC','/suppression']]],
  ['Operations', [['Reports','/reports'],['Cost & Usage','/cost-usage'],['Audit Log','/audit'],['System','/system'],['Settings','/settings']]],
] as const;
const publicPrefixes=['/login','/auth'];

export function AppShell({children}:{children:ReactNode}){const pathname=usePathname();const isPublic=publicPrefixes.some(p=>pathname===p||pathname.startsWith(`${p}/`));if(isPublic)return <>{children}</>;return <div className="shell"><aside className="sidebar"><div className="brand">Smart Visions</div><div className="badge">Growth OS</div><nav>{groups.map(([group,items])=><div className="navGroup" key={group}><span className="navLabel">{group}</span>{items.map(([item,href])=>{const active=href==='/'?pathname==='/':pathname===href||pathname.startsWith(`${href}/`);return <Link className={active?'active':undefined} href={href} key={item}>{item}</Link>})}</div>)}</nav></aside><main className="content">{children}</main></div>}
