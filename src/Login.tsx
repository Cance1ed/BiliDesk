import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { RefreshCw, Smartphone, LoaderCircle, CheckCircle2 } from 'lucide-react';
import { api } from './api';
export function Login({ success }: { success(): void }) {
  const [revision, setRevision] = useState(0),
    [image, setImage] = useState(''),
    [message, setMessage] = useState('正在获取二维码…'),
    [expired, setExpired] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    let cancelled = false,
      timer: ReturnType<typeof setTimeout>;
    setImage('');
    setExpired(false);
    setConfirmed(false);
    setMessage('正在获取二维码…');
    const poll = async (key: string) => {
      if (cancelled) return;
      try {
        const data = await api.poll(key);
        if (cancelled) return;
        if (data.code === 0) {
          setConfirmed(true);
          setMessage('登录成功');
          success();
          return;
        }
        if (data.code === 86038) {
          setExpired(true);
          setMessage('二维码已过期，请刷新');
          return;
        }
        setMessage(data.code === 86090 ? '已扫码，请在手机上确认登录' : '请使用哔哩哔哩 App 扫码');
        timer = setTimeout(() => poll(key), 2500);
      } catch (error) {
        if (!cancelled) {
          setMessage((error as Error).message);
          setExpired(true);
        }
      }
    };
    api
      .qr()
      .then(async (qr) => {
        const png = await QRCode.toDataURL(qr.url, {
          width: 240,
          margin: 2,
          color: { dark: '#262831', light: '#ffffff' },
        });
        if (cancelled) return;
        setImage(png);
        setMessage('请使用哔哩哔哩 App 扫码');
        timer = setTimeout(() => poll(qr.qrcode_key), 2500);
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage(error.message);
          setExpired(true);
        }
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [revision, success]);
  return (
    <div className="login-content">
      <p>连接你的收藏，让喜欢的画面常驻桌面。</p>
      <div className="qr-frame">
        {confirmed ? (
          <CheckCircle2 size={56} />
        ) : image ? (
          <img src={image} alt="Bilibili 扫码登录二维码" className={expired ? 'expired' : ''} />
        ) : (
          <LoaderCircle size={32} className={expired ? '' : 'spin'} />
        )}
      </div>
      <div className="login-message" role="status">
        <Smartphone size={18} />
        {message}
      </div>
      {expired && (
        <button className="button secondary" onClick={() => setRevision((x) => x + 1)}>
          <RefreshCw size={16} />
          刷新二维码
        </button>
      )}
      <div className="privacy-note">
        无需提供密码。登录凭据经系统加密后，仅保存在本机。
        <br />
        不登录也可以通过视频链接使用。
      </div>
    </div>
  );
}
