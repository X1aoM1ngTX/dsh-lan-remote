/**
 * dsh-lan-remote — Client half.
 *
 * One settings page: share this computer's DSH over the LAN, and keep the
 * links of other computers' DSH so they open in one click.
 */

window.__ModuleLoader__.load({
  id: '@x1aom1ngtx/dsh-lan-remote',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useState } = React;

    const NS = '@x1aom1ngtx/dsh-lan-remote';
    const API = '/__lan_remote/api';

    const ZH = {
      'section.title': '局域网远程',
      'page.subtitle': '在同一个局域网内，用另一台电脑的浏览器使用这台电脑上的 DSH；也可以在这里保存并一键打开其他电脑的 DSH。',
      'share.title': '本机共享',
      'share.on': '已开启。局域网内拿到访问码的人可以连接这台电脑。',
      'share.off': '未开启。其他电脑无法连接这台电脑。',
      'share.links': '分享链接',
      'share.copy': '复制',
      'share.copied': '已复制',
      'share.port': '端口',
      'share.portHint': '其他电脑通过这个端口连接本机，默认 4778。',
      'share.regenerate': '重置访问码',
      'share.noAddress': '没有检测到局域网 IPv4 地址，请检查网络连接。',
      'share.warning': '开启后，局域网内拿到链接的人可以像坐在这台电脑前一样使用这个 DSH：读写文件、执行命令、使用已登录的账号。请只在可信网络中开启，并且只把链接发给可信的人。',
      'share.firewall': '另一台电脑连不上？',
      'share.firewallBody': 'Windows 防火墙默认会拦截外部连接。请在这台电脑上用管理员权限打开 PowerShell，执行一次：',
      'peers.title': '其他电脑',
      'peers.desc': '在另一台电脑上打开它的 DSH，进入「设置 → 局域网远程」，开启共享并复制分享链接，再粘贴到这里。',
      'peers.namePlaceholder': '名称（可选）',
      'peers.urlPlaceholder': 'http://192.168.1.8:4778/?lan=ABCD-1234',
      'peers.add': '添加',
      'peers.empty': '还没有保存其他电脑。',
      'peers.connect': '连接',
      'peers.test': '测试',
      'peers.remove': '删除',
      'peers.untested': '尚未测试',
      'peers.testing': '测试中…',
      'peers.ok': '连接正常 · {ms} ms',
      'peers.failed': '无法连接：{reason}',
      'common.refresh': '刷新',
      'common.error': '操作失败',
      'error.unreachable': '无法访问本机插件服务。请确认页面是通过 http://127.0.0.1 打开的，而不是本地文件。',
      'error.copy': '复制失败，请手动选择链接复制。',
      'gateway.portBusy': '端口已被占用，请换一个端口。',
    };

    const EN = {
      'section.title': 'LAN remote',
      'page.subtitle': 'Use this computer’s DSH from another computer on the same LAN, and keep the links of other computers’ DSH for one-click access.',
      'share.title': 'Share this computer',
      'share.on': 'Running. Anyone on this LAN with the access code can connect.',
      'share.off': 'Off. Other computers cannot reach this DSH.',
      'share.links': 'Share links',
      'share.copy': 'Copy',
      'share.copied': 'Copied',
      'share.port': 'Port',
      'share.portHint': 'Other computers connect through this port. 4778 by default.',
      'share.regenerate': 'New code',
      'share.noAddress': 'No LAN IPv4 address was detected. Check the network connection.',
      'share.warning': 'While this is on, anyone on the LAN who has the link can use this DSH exactly as if they were at this computer: read and write files, run commands, and use the signed-in account. Turn it on only in a trusted network, and share the link only with people you trust.',
      'share.firewall': 'Another computer cannot connect?',
      'share.firewallBody': 'Windows Firewall blocks inbound connections by default. Run this once in an administrator PowerShell window on this computer:',
      'peers.title': 'Other computers',
      'peers.desc': 'On the other computer, open its DSH, go to Settings → LAN remote, turn on sharing and copy the share link. Paste it here.',
      'peers.namePlaceholder': 'Name (optional)',
      'peers.urlPlaceholder': 'http://192.168.1.8:4778/?lan=ABCD-1234',
      'peers.add': 'Add',
      'peers.empty': 'No other computer saved yet.',
      'peers.connect': 'Connect',
      'peers.test': 'Test',
      'peers.remove': 'Remove',
      'peers.untested': 'Not tested yet',
      'peers.testing': 'Testing…',
      'peers.ok': 'Reachable · {ms} ms',
      'peers.failed': 'Unreachable: {reason}',
      'common.refresh': 'Refresh',
      'common.error': 'Something went wrong',
      'error.unreachable': 'Cannot reach the plugin service. Open this page over http://127.0.0.1 rather than a local file.',
      'error.copy': 'Copy failed. Select the link and copy it manually.',
      'gateway.portBusy': 'That port is already in use. Choose another one.',
    };

    const CSS = `
      .lanr-root { display: flex; flex-direction: column; gap: 14px; padding: 2px 2px 28px; max-width: 760px; }
      .lanr-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
      .lanr-title { font-size: 14px; font-weight: 600; color: var(--dsw-alias-label-primary); }
      .lanr-sub { margin: 3px 0 0; font-size: 12.5px; line-height: 1.6; color: var(--dsw-alias-label-secondary); }
      .lanr-card { display: flex; flex-direction: column; gap: 12px; padding: 14px 16px; border-radius: 10px;
        border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); }
      .lanr-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
      .lanr-desc { margin: 3px 0 0; font-size: 12.5px; line-height: 1.6; color: var(--dsw-alias-label-secondary); }
      .lanr-btn { height: 28px; padding: 0 11px; border-radius: 7px; cursor: pointer; font-size: 12.5px;
        border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-label-primary); text-decoration: none; display: inline-flex;
        align-items: center; justify-content: center; white-space: nowrap; }
      .lanr-btn:hover { border-color: var(--dsw-alias-border-l2); }
      .lanr-btn:disabled { opacity: .55; cursor: default; }
      .lanr-btn-primary { border-color: transparent; background: var(--dsw-alias-brand-primary);
        color: var(--dsw-alias-bg-base); font-weight: 600; }
      .lanr-btn-primary:hover { filter: brightness(.94); }
      .lanr-btn-ghost { background: transparent; }
      /* The brand alias is an inverted neutral (near-white on dark), not a fill
         color, so the switch carries the plugin's own accent. */
      .lanr-switch { position: relative; flex: none; width: 38px; height: 22px; padding: 0; border-radius: 999px;
        cursor: pointer; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2);
        transition: background .15s ease; }
      .lanr-switch[aria-checked="true"] { background: #247bbf; border-color: transparent; }
      .lanr-switch:disabled { opacity: .55; cursor: default; }
      .lanr-knob { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%;
        background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, .35); transition: transform .15s ease; }
      .lanr-switch[aria-checked="true"] .lanr-knob { transform: translateX(16px); }
      .lanr-label { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
      .lanr-links { display: flex; flex-direction: column; gap: 6px; }
      .lanr-link { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 7px;
        border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); }
      .lanr-link code { flex: 1; min-width: 0; word-break: break-all; font-size: 12px; line-height: 1.5;
        color: var(--dsw-alias-label-primary); font-family: ui-monospace, "Cascadia Code", Consolas, monospace; }
      .lanr-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px;
        color: var(--dsw-alias-label-secondary); }
      .lanr-port { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .lanr-port .lanr-desc { margin: 0; }
      .lanr-chip { padding: 2px 8px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1);
        font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
      .lanr-warn { font-size: 12px; line-height: 1.6; color: var(--dsw-alias-state-warn-primary); }
      .lanr-alert { padding: 8px 10px; border-radius: 7px; font-size: 12.5px;
        border: 1px solid var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
      .lanr-details { font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-secondary); }
      .lanr-details summary { cursor: pointer; color: var(--dsw-alias-label-secondary); }
      .lanr-code { margin: 8px 0 0; padding: 8px 10px; border-radius: 7px; overflow-x: auto;
        border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2);
        font-family: ui-monospace, "Cascadia Code", Consolas, monospace; font-size: 11.5px;
        color: var(--dsw-alias-label-primary); white-space: pre-wrap; word-break: break-all; }
      .lanr-form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
      .lanr-input { height: 30px; padding: 0 10px; border-radius: 7px; font-size: 12.5px;
        border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-base);
        color: var(--dsw-alias-label-primary); min-width: 0; }
      .lanr-input:focus { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }
      .lanr-input-name { flex: 1 1 130px; }
      .lanr-input-url { flex: 3 1 220px; }
      .lanr-peer { display: flex; align-items: center; justify-content: space-between; gap: 12px;
        padding: 10px 12px; border-radius: 9px; border: 1px solid var(--dsw-alias-border-l1);
        background: var(--dsw-alias-bg-base); }
      .lanr-peer-main { min-width: 0; }
      .lanr-peer-name { display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 600;
        color: var(--dsw-alias-label-primary); }
      .lanr-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); }
      .lanr-dot-ok { background: var(--dsw-alias-state-success-primary); }
      .lanr-dot-bad { background: var(--dsw-alias-state-error-primary); }
      .lanr-peer-meta { margin-top: 2px; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-secondary);
        word-break: break-all; }
      .lanr-peer-actions { display: flex; gap: 6px; flex: none; }
      .lanr-empty { padding: 18px 12px; text-align: center; font-size: 12.5px;
        color: var(--dsw-alias-label-secondary); border: 1px dashed var(--dsw-alias-border-l1); border-radius: 9px; }
      .lanr-foot { font-size: 11.5px; line-height: 1.6; color: var(--dsw-alias-label-secondary); }
    `;

    function format(text, values) {
      return String(text).replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match));
    }

    async function request(path, body) {
      let response;
      try {
        response = await fetch(`${API}${path}`, {
          method: body === undefined ? 'GET' : 'POST',
          headers: body === undefined ? undefined : { 'content-type': 'application/json' },
          credentials: 'same-origin',
          cache: 'no-store',
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (error) {
        throw new Error(error && error.message === 'Failed to fetch' ? 'unreachable' : String(error));
      }
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error((payload && payload.error) || `HTTP ${response.status}`);
      return payload;
    }

    function peerHost(peer) {
      try {
        return new URL(peer.url).host;
      } catch {
        return peer.url;
      }
    }

    function peerStatus(peer, t) {
      const check = peer.lastCheck;
      if (!check) return { tone: '', text: t('peers.untested') };
      if (check.ok) {
        return {
          tone: 'ok',
          text: check.name
            ? `${check.name} · ${format(t('peers.ok'), { ms: check.latencyMs })}`
            : format(t('peers.ok'), { ms: check.latencyMs }),
        };
      }
      return { tone: 'bad', text: format(t('peers.failed'), { reason: check.error || t('common.error') }) };
    }

    function Page(props) {
      const t = props.t;
      const [state, setState] = useState(null);
      const [error, setError] = useState('');
      const [busy, setBusy] = useState('');
      const [busyPeer, setBusyPeer] = useState('');
      const [copied, setCopied] = useState('');
      const [form, setForm] = useState({ name: '', url: '' });
      const [port, setPort] = useState('');
      const [, setLocaleRevision] = useState(0);

      const fail = useCallback((thrown) => {
        const message = thrown && thrown.message ? thrown.message : String(thrown);
        setError(message === 'unreachable' ? t('error.unreachable') : message);
      }, [t]);

      const applyState = useCallback((next) => {
        if (!next || typeof next !== 'object') return;
        setState(next);
        setPort((current) => (current === '' ? String(next.gateway ? next.gateway.port : '') : current));
      }, []);

      const load = useCallback(async () => {
        try {
          applyState(await request('/state'));
          setError('');
        } catch (thrown) {
          fail(thrown);
        }
      }, [applyState, fail]);

      useEffect(() => {
        const locale = props.ctx.get('locale');
        if (!locale || typeof locale.subscribe !== 'function') return undefined;
        return locale.subscribe(() => setLocaleRevision((value) => value + 1));
      }, [props.ctx]);

      useEffect(() => {
        let alive = true;
        const tick = () => {
          if (!alive) return;
          void load();
        };
        tick();
        const timer = window.setInterval(tick, 5000);
        return () => {
          alive = false;
          window.clearInterval(timer);
        };
      }, [load]);

      const act = useCallback(async (key, path, body) => {
        setBusy(key);
        setError('');
        try {
          applyState(await request(path, body));
        } catch (thrown) {
          fail(thrown);
        } finally {
          setBusy('');
        }
      }, [applyState, fail]);

      const copy = useCallback(async (text) => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(text);
          window.setTimeout(() => setCopied(''), 1600);
        } catch {
          setError(t('error.copy'));
        }
      }, [t]);

      const addPeer = useCallback(async (event) => {
        event.preventDefault();
        if (!form.url.trim()) return;
        setBusy('add');
        setError('');
        try {
          applyState(await request('/peers', { action: 'add', name: form.name, url: form.url }));
          setForm({ name: '', url: '' });
        } catch (thrown) {
          fail(thrown);
        } finally {
          setBusy('');
        }
      }, [applyState, fail, form]);

      const probePeer = useCallback(async (peer) => {
        setBusyPeer(peer.id);
        setError('');
        try {
          applyState(await request('/peers', { action: 'probe', id: peer.id }));
        } catch (thrown) {
          fail(thrown);
        } finally {
          setBusyPeer('');
        }
      }, [applyState, fail]);

      const removePeer = useCallback(async (peer) => {
        setError('');
        try {
          applyState(await request('/peers', { action: 'remove', id: peer.id }));
        } catch (thrown) {
          fail(thrown);
        }
      }, [applyState, fail]);

      const gateway = state ? state.gateway : null;
      const shared = Boolean(gateway && gateway.enabled);
      const addresses = state && state.host && Array.isArray(state.host.addresses) ? state.host.addresses : [];
      const urls = gateway && Array.isArray(gateway.urls) ? gateway.urls : [];
      const peers = state && Array.isArray(state.peers) ? state.peers : [];
      const firewall = `New-NetFirewallRule -DisplayName "DSH LAN Remote" -Direction Inbound -Action Allow -Protocol TCP -LocalPort ${gateway ? gateway.port : 4778} -Profile Private`;

      return h('div', { className: 'lanr-root' },
        h('style', null, CSS),
        h('div', { className: 'lanr-head' },
          h('div', null,
            h('div', { className: 'lanr-title' }, t('section.title')),
            h('p', { className: 'lanr-sub' }, t('page.subtitle')),
          ),
          h('button', {
            type: 'button', className: 'lanr-btn lanr-btn-ghost',
            onClick: () => void load(), disabled: Boolean(busy),
          }, t('common.refresh')),
        ),

        error ? h('div', { className: 'lanr-alert' }, error) : null,

        h('section', { className: 'lanr-card' },
          h('div', { className: 'lanr-row' },
            h('div', null,
              h('div', { className: 'lanr-title' }, t('share.title')),
              h('p', { className: 'lanr-desc' }, shared ? t('share.on') : t('share.off')),
            ),
            h('button', {
              type: 'button', role: 'switch', 'aria-checked': shared ? 'true' : 'false',
              'aria-label': t('share.title'), className: 'lanr-switch', disabled: Boolean(busy),
              onClick: () => void act('gateway', '/gateway', { enabled: !shared }),
            }, h('span', { className: 'lanr-knob' })),
          ),

          gateway && gateway.error
            ? h('div', { className: 'lanr-alert' }, gateway.error === 'EADDRINUSE' || gateway.error.includes('占用') ? t('gateway.portBusy') : gateway.error)
            : null,

          shared
            ? h('div', { className: 'lanr-field' },
                h('div', { className: 'lanr-label' }, t('share.links')),
                urls.length === 0
                  ? h('div', { className: 'lanr-desc' }, t('share.noAddress'))
                  : h('div', { className: 'lanr-links' }, urls.map((url) => h('div', { className: 'lanr-link', key: url },
                      h('code', null, url),
                      h('button', {
                        type: 'button', className: 'lanr-btn',
                        onClick: () => void copy(url),
                      }, copied === url ? t('share.copied') : t('share.copy')),
                    ))),
              )
            : null,

          shared
            ? h('div', { className: 'lanr-meta' },
                h('span', { className: 'lanr-chip' }, `${t('share.port')} ${gateway.port}`),
                h('span', { className: 'lanr-chip' }, `${t('share.code')} ${gateway.code}`),
                addresses.length > 1 ? h('span', { className: 'lanr-chip' }, addresses.join(' · ')) : null,
                h('button', {
                  type: 'button', className: 'lanr-btn lanr-btn-ghost', disabled: Boolean(busy),
                  onClick: () => void act('gateway', '/gateway', { regenerate: true }),
                }, t('share.regenerate')),
              )
            : h('div', { className: 'lanr-port' },
                h('span', { className: 'lanr-label' }, t('share.port')),
                h('input', {
                  className: 'lanr-input', style: { width: '92px' }, inputMode: 'numeric', value: port,
                  'aria-label': t('share.port'),
                  onChange: (event) => setPort(event.target.value.replace(/[^0-9]/g, '')),
                  onBlur: () => {
                    const next = Number(port);
                    if (gateway && Number.isInteger(next) && next >= 1024 && next <= 65535 && next !== gateway.port) {
                      void act('gateway', '/gateway', { port: next });
                    } else if (gateway) {
                      setPort(String(gateway.port));
                    }
                  },
                }),
                h('span', { className: 'lanr-desc' }, t('share.portHint')),
              ),

          h('div', { className: 'lanr-warn' }, t('share.warning')),

          h('details', { className: 'lanr-details' },
            h('summary', null, t('share.firewall')),
            h('div', { style: { marginTop: '6px' } }, t('share.firewallBody')),
            h('pre', { className: 'lanr-code' }, firewall),
          ),
        ),

        h('section', { className: 'lanr-card' },
          h('div', null,
            h('div', { className: 'lanr-title' }, t('peers.title')),
            h('p', { className: 'lanr-desc' }, t('peers.desc')),
          ),
          h('form', { className: 'lanr-form', onSubmit: addPeer },
            h('input', {
              className: 'lanr-input lanr-input-name', value: form.name,
              placeholder: t('peers.namePlaceholder'), 'aria-label': t('peers.namePlaceholder'),
              onChange: (event) => setForm({ ...form, name: event.target.value }),
            }),
            h('input', {
              className: 'lanr-input lanr-input-url', value: form.url, spellCheck: false,
              placeholder: t('peers.urlPlaceholder'), 'aria-label': t('peers.urlPlaceholder'),
              onChange: (event) => setForm({ ...form, url: event.target.value }),
            }),
            h('button', {
              type: 'submit', className: 'lanr-btn lanr-btn-primary', disabled: busy === 'add' || !form.url.trim(),
            }, t('peers.add')),
          ),
          peers.length === 0
            ? h('div', { className: 'lanr-empty' }, t('peers.empty'))
            : peers.map((peer) => {
                const status = peerStatus(peer, t);
                const dot = status.tone === 'ok' ? 'lanr-dot lanr-dot-ok' : status.tone === 'bad' ? 'lanr-dot lanr-dot-bad' : 'lanr-dot';
                return h('div', { className: 'lanr-peer', key: peer.id },
                  h('div', { className: 'lanr-peer-main' },
                    h('div', { className: 'lanr-peer-name' },
                      h('span', { className: dot }),
                      peer.name || peerHost(peer),
                    ),
                    peer.name ? h('div', { className: 'lanr-peer-meta' }, peerHost(peer)) : null,
                    h('div', { className: 'lanr-peer-meta' },
                      busyPeer === peer.id ? t('peers.testing') : status.text),
                  ),
                  h('div', { className: 'lanr-peer-actions' },
                    h('a', {
                      className: 'lanr-btn lanr-btn-primary', href: peer.url,
                      target: '_blank', rel: 'noopener noreferrer',
                    }, t('peers.connect')),
                    h('button', {
                      type: 'button', className: 'lanr-btn', disabled: busyPeer === peer.id,
                      onClick: () => void probePeer(peer),
                    }, t('peers.test')),
                    h('button', {
                      type: 'button', className: 'lanr-btn lanr-btn-ghost',
                      onClick: () => void removePeer(peer),
                    }, t('peers.remove')),
                  ),
                );
              }),
        ),

        h('p', { className: 'lanr-foot' },
          state && state.host && state.host.name ? `${state.host.name} · ${state.version}` : '',
        ),
      );
    }

    return {
      // A hard dependency on `locale`: at page boot the service may still be
      // activating, and a late `ctx.get('locale')` leaves every key untranslated.
      inject: ['slots', 'locale'],
      apply(ctx) {
        const locale = ctx.locale;
        ctx.effect(() => {
          const disposers = [];
          for (const [id, dict] of [['zh', ZH], ['en', EN]]) {
            try {
              disposers.push(locale.register(NS, id, dict));
            } catch (error) {
              // A duplicate registration still leaves the earlier dictionaries in place.
              console.error(`lan-remote: locale registration failed for ${id}`, error);
            }
          }
          return () => {
            for (const dispose of disposers) dispose();
          };
        }, 'lan-remote: locale dictionaries');
        const t = locale.bind(NS);

        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'lan-remote',
          order: 40,
          label: () => t('section.title'),
        }, (props) => h(Page, { ...props, ctx, t })));
      },
    };
  },
});
