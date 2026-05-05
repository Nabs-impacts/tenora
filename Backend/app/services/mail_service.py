import time
from concurrent.futures import Future, ThreadPoolExecutor

import httpx
from loguru import logger

from app.config import settings

# ─── Brevo (Sendinblue) ───────────────────────────────────────────────────────
_BREVO_URL     = "https://api.brevo.com/v3/smtp/email"
_BREVO_TIMEOUT = 10.0

_mail_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="mail")

_MAX_ATTEMPTS  = 3
_RETRY_DELAYS  = (1, 2)


# ─── Tenora Brutalist palette ─────────────────────────────────────────────────
# Aligné sur le design system du panel (Neon Brutalism+).
C_BG          = "#101014"   # background
C_CARD        = "#16161C"   # card
C_CARD_2      = "#1C1C24"   # surface elev
C_BORDER      = "#2C2C33"   # border
C_BORDER_HOT  = "#3A3A44"   # border hover
C_FG          = "#F5F5F0"   # foreground
C_FG_DIM      = "#B8B8B0"   # muted text
C_MUTED       = "#7A7A82"   # muted-foreground
C_MUTED_2     = "#494952"   # very muted

C_PRIMARY     = "#C6F31F"   # acid lime (primary)
C_PRIMARY_DK  = "#0F0F05"   # primary-foreground
C_SECONDARY   = "#FF2DBE"   # magenta
C_TERTIARY    = "#3D7BFF"   # blue
C_SUCCESS     = "#22D572"   # green
C_WARNING     = "#FFA32B"   # amber
C_DANGER      = "#F03A3A"   # red
C_INFO        = "#19B4FF"   # cyan

# Police "mono" / "display" — fallbacks email-safe.
F_MONO    = "'JetBrains Mono','SFMono-Regular',Consolas,monospace"
F_DISPLAY = "'Space Grotesk','Helvetica Neue',Helvetica,Arial,sans-serif"
F_BODY    = "'Space Grotesk','Helvetica Neue',Helvetica,Arial,sans-serif"


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _fmt_price(price: float) -> str:
    try:
        return f"{int(price):,} FCFA".replace(",", "\u202f")
    except Exception:
        return f"{price} FCFA"


def _get_admins() -> list[str]:
    raw = getattr(settings, "MAIL_ADMIN", "")
    return [e.strip() for e in raw.split(",") if e.strip()]


# ─── MailResult ───────────────────────────────────────────────────────────────

class MailResult:
    __slots__ = ("ok", "attempts", "error")

    def __init__(self, ok: bool, attempts: int, error: str | None = None):
        self.ok = ok
        self.attempts = attempts
        self.error = error

    def __repr__(self) -> str:
        return (f"MailResult(ok={self.ok}, attempts={self.attempts}"
                + (f", error={self.error!r})" if self.error else ")"))


def _send(to: str | list[str], subject: str, html: str) -> Future:
    recipients = to if isinstance(to, list) else [to]

    def _worker() -> MailResult:
        if not settings.BREVO_API_KEY:
            logger.error("BREVO_API_KEY manquant — email non envoyé")
            return MailResult(ok=False, attempts=0, error="BREVO_API_KEY missing")
        if not settings.MAIL_FROM_EMAIL:
            logger.error("MAIL_FROM_EMAIL manquant — email non envoyé")
            return MailResult(ok=False, attempts=0, error="MAIL_FROM_EMAIL missing")

        payload = {
            "sender": {
                "name":  settings.MAIL_FROM_NAME or settings.APP_NAME or "Tenora",
                "email": settings.MAIL_FROM_EMAIL,
            },
            "to":          [{"email": r} for r in recipients],
            "subject":     subject,
            "htmlContent": html,
        }
        headers = {
            "accept":       "application/json",
            "content-type": "application/json",
            "api-key":      settings.BREVO_API_KEY,
        }

        last_err: Exception | None = None
        for attempt in range(1, _MAX_ATTEMPTS + 1):
            try:
                resp = httpx.post(_BREVO_URL, json=payload, headers=headers, timeout=_BREVO_TIMEOUT)
                resp.raise_for_status()
                msg_id = ""
                try:
                    msg_id = resp.json().get("messageId", "")
                except Exception:
                    pass
                logger.success(
                    f"Email envoyé via Brevo (tentative {attempt}/{_MAX_ATTEMPTS}) "
                    f"| {subject} → {recipients} | id={msg_id}"
                )
                return MailResult(ok=True, attempts=attempt)

            except httpx.HTTPStatusError as exc:
                last_err = exc
                status = exc.response.status_code
                body   = exc.response.text[:500]
                logger.warning(
                    f"Tentative {attempt}/{_MAX_ATTEMPTS} échouée (HTTP {status}) "
                    f"| {subject} → {recipients} | {body}"
                )
                if 400 <= status < 500 and status != 429:
                    break
                if attempt < _MAX_ATTEMPTS:
                    time.sleep(_RETRY_DELAYS[attempt - 1])

            except Exception as exc:
                last_err = exc
                logger.warning(
                    f"Tentative {attempt}/{_MAX_ATTEMPTS} échouée "
                    f"| {subject} → {recipients} | {exc}"
                )
                if attempt < _MAX_ATTEMPTS:
                    time.sleep(_RETRY_DELAYS[attempt - 1])

        logger.error(
            f"Échec définitif Brevo ({_MAX_ATTEMPTS} tentatives) "
            f"| {subject} → {recipients} | {last_err}"
        )
        return MailResult(ok=False, attempts=_MAX_ATTEMPTS, error=str(last_err))

    return _mail_pool.submit(_worker)


# ─── Template HTML — Tenora Brutalist ─────────────────────────────────────────

def _wordmark() -> str:
    """TENORA. — TENORA blanc, le point en acid lime."""
    return (
        f'<span style="font-family:{F_DISPLAY};font-size:22px;font-weight:700;'
        f'letter-spacing:-0.02em;color:{C_FG};line-height:1;">'
        f'TENORA<span style="color:{C_PRIMARY};">.</span></span>'
    )


def _base(inner: str, preheader: str = "") -> str:
    site_url = getattr(settings, "SITE_URL", "https://tenora.store")
    pre = (f'<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;'
           f'opacity:0;color:transparent;height:0;width:0;">'
           f'{preheader}&nbsp;</div>') if preheader else ""

    return f"""<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="color-scheme" content="dark"/>
  <meta name="supported-color-schemes" content="dark"/>
  <title>Tenora</title>
</head>
<body style="margin:0;padding:0;background:{C_BG};
  font-family:{F_BODY};-webkit-text-size-adjust:100%;color:{C_FG};">
  {pre}

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background:{C_BG};">
    <tr><td align="center" style="padding:40px 16px 56px;">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
        style="max-width:600px;width:100%;">

        <!-- TOPBAR — mono / status -->
        <tr><td style="padding:0 4px 14px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-family:{F_MONO};font-size:10px;letter-spacing:0.3em;
                text-transform:uppercase;color:{C_MUTED};">
                // TENORA.MAIL // SECURE
              </td>
              <td align="right" style="font-family:{F_MONO};font-size:10px;
                letter-spacing:0.3em;text-transform:uppercase;color:{C_MUTED};">
                <span style="display:inline-block;width:6px;height:6px;background:{C_SUCCESS};
                  border-radius:50%;vertical-align:middle;margin-right:6px;"></span>
                ENCRYPTED
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- WORDMARK -->
        <tr><td style="padding:0 4px 18px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>{_wordmark()}</td>
              <td align="right" style="font-family:{F_MONO};font-size:10px;
                letter-spacing:0.2em;text-transform:uppercase;color:{C_MUTED_2};">
                NIAMEY · NE
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- CARD (brackets brutalist + offset shadow) -->
        <tr><td style="padding:0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
            style="background:{C_PRIMARY};">
            <tr><td style="padding:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background:{C_CARD};border:2px solid {C_BORDER};
                margin:-6px 6px 6px -6px;transform:translate(-3px,-3px);">
                <tr><td style="padding:0;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr><td style="height:4px;background:{C_PRIMARY};font-size:0;line-height:0;">&nbsp;</td></tr>
                  </table>
                  {inner}
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <!-- FOOTER -->
        <tr><td style="padding:32px 4px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="font-family:{F_MONO};font-size:10px;letter-spacing:0.25em;
              text-transform:uppercase;color:{C_MUTED_2};padding-bottom:10px;">
              ── END.OF.TRANSMISSION ──
            </td></tr>
            <tr><td style="font-family:{F_BODY};font-size:12px;color:{C_MUTED};
              line-height:1.7;padding-bottom:6px;">
              Vous recevez cet email parce que vous avez un compte Tenora.
            </td></tr>
            <tr><td style="font-family:{F_MONO};font-size:11px;color:{C_MUTED_2};
              letter-spacing:0.05em;">
              <a href="{site_url}" style="color:{C_PRIMARY};text-decoration:none;
                border-bottom:1px solid {C_PRIMARY};">tenora.store</a>
              &nbsp;//&nbsp;
              <a href="{site_url}/mes-commandes" style="color:{C_MUTED};
                text-decoration:none;">MES.COMMANDES</a>
            </td></tr>
            <tr><td style="font-family:{F_MONO};font-size:9px;letter-spacing:0.3em;
              text-transform:uppercase;color:{C_MUTED_2};padding-top:14px;">
              TENORA &copy; {time.strftime("%Y")} — ALL.SYSTEMS.ONLINE
            </td></tr>
          </table>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _eyebrow(text: str, color: str = None) -> str:
    color = color or C_PRIMARY
    return (f'<p style="margin:0 0 14px;font-family:{F_MONO};font-size:10px;'
            f'font-weight:700;letter-spacing:0.3em;text-transform:uppercase;'
            f'color:{color};">// {text}</p>')


def _header_section(eyebrow: str, eyebrow_color: str, title: str, subtitle: str) -> str:
    return f"""<tr><td style="padding:36px 36px 0;">
      {_eyebrow(eyebrow, eyebrow_color)}
      <h1 style="margin:0 0 12px;font-family:{F_DISPLAY};font-size:30px;
        font-weight:700;color:{C_FG};letter-spacing:-0.02em;line-height:1.05;">
        {title}
      </h1>
      <p style="margin:0;font-family:{F_BODY};font-size:14px;color:{C_FG_DIM};
        line-height:1.6;">
        {subtitle}
      </p>
    </td></tr>"""


def _divider() -> str:
    return (f'<tr><td style="padding:28px 36px 0;">'
            f'<div style="height:2px;background:{C_BORDER};font-size:0;line-height:0;">'
            f'&nbsp;</div></td></tr>')


def _detail_table(rows: list[tuple[str, str]]) -> str:
    rows_html = ""
    for label, value in rows:
        rows_html += (
            f'<tr>'
            f'<td style="padding:12px 14px;background:{C_CARD_2};'
            f'border:1px solid {C_BORDER};border-right:0;'
            f'font-family:{F_MONO};font-size:10px;font-weight:700;'
            f'letter-spacing:0.18em;text-transform:uppercase;'
            f'color:{C_MUTED};width:42%;vertical-align:middle;">{label}</td>'
            f'<td style="padding:12px 14px;background:{C_CARD};'
            f'border:1px solid {C_BORDER};'
            f'font-family:{F_MONO};font-size:13px;font-weight:600;'
            f'color:{C_FG};text-align:right;vertical-align:middle;">{value}</td>'
            f'</tr>'
        )
    return f"""<tr><td style="padding:24px 36px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
        style="border-collapse:separate;border-spacing:0 4px;">
        {rows_html}
      </table>
    </td></tr>"""


def _status_chip(color: str, label: str) -> str:
    return (f'<tr><td style="padding:24px 36px 0;">'
            f'<span style="display:inline-block;padding:6px 14px;'
            f'background:{C_BG};border:2px solid {color};'
            f'font-family:{F_MONO};font-size:10px;font-weight:700;'
            f'letter-spacing:0.2em;text-transform:uppercase;color:{color};">'
            f'<span style="display:inline-block;width:6px;height:6px;'
            f'background:{color};border-radius:50%;vertical-align:middle;'
            f'margin-right:8px;"></span>{label}</span>'
            f'</td></tr>')


def _info_block(border_color: str, text: str) -> str:
    return (f'<tr><td style="padding:22px 36px 0;">'
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
            f'<tr>'
            f'<td style="width:4px;background:{border_color};font-size:0;line-height:0;">&nbsp;</td>'
            f'<td style="padding:14px 16px;background:{C_CARD_2};'
            f'border:1px solid {C_BORDER};border-left:0;">'
            f'<p style="margin:0;font-family:{F_BODY};font-size:13px;'
            f'color:{C_FG_DIM};line-height:1.65;">{text}</p>'
            f'</td>'
            f'</tr></table>'
            f'</td></tr>')


def _cta_button(url: str, label: str, bg: str = None, color: str = None) -> str:
    bg = bg or C_PRIMARY
    color = color or C_PRIMARY_DK
    return f"""<tr><td style="padding:30px 36px 36px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="background:{C_FG};">
            <a href="{url}" style="display:inline-block;padding:14px 28px;
              background:{bg};border:2px solid {bg};
              transform:translate(-4px,-4px);
              font-family:{F_MONO};font-size:12px;font-weight:700;
              letter-spacing:0.18em;text-transform:uppercase;
              color:{color};text-decoration:none;">
              ▸ {label}
            </a>
          </td>
        </tr>
      </table>
    </td></tr>"""


# ─── 1. Vérification email ────────────────────────────────────────────────────

def send_otp_email(email: str, code: str) -> Future:
    site_url = getattr(settings, "SITE_URL", "https://tenora.store")
    digits = "".join(
        f'<td style="width:46px;height:56px;background:{C_CARD_2};'
        f'border:2px solid {C_BORDER};text-align:center;vertical-align:middle;'
        f'font-family:{F_MONO};font-size:26px;font-weight:700;color:{C_PRIMARY};">'
        f'{c}</td><td style="width:8px;"></td>'
        for c in code
    )
    inner = f"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      {_header_section("AUTH.VERIFICATION", C_PRIMARY,
        "V&eacute;rifiez votre email",
        f"Saisissez ce code pour activer votre compte {settings.APP_NAME}.")}
      {_divider()}
      <tr><td style="padding:28px 36px 0;text-align:center;">
        <p style="margin:0 0 18px;font-family:{F_MONO};font-size:10px;
          font-weight:700;letter-spacing:0.25em;text-transform:uppercase;
          color:{C_MUTED};">CODE.VERIFICATION</p>
        <table role="presentation" cellpadding="0" cellspacing="0"
          style="margin:0 auto;"><tr>{digits}</tr></table>
        <p style="margin:20px 0 0;font-family:{F_MONO};font-size:11px;
          letter-spacing:0.15em;text-transform:uppercase;color:{C_MUTED};">
          EXPIRE.DANS &nbsp;<strong style="color:{C_FG};">10.MIN</strong>
        </p>
      </td></tr>
      {_info_block(C_MUTED,
        "Si vous n&rsquo;avez pas cr&eacute;&eacute; de compte sur Tenora, "
        "ignorez simplement cet email.")}
      {_cta_button(site_url, "Aller sur Tenora")}
    </table>"""

    return _send(email, f"Votre code de vérification — {settings.APP_NAME}",
          _base(inner, f"Votre code : {code} — expire dans 10 minutes"))


# ─── 2. Commande créée — client ───────────────────────────────────────────────

def send_order_created(email: str, order_id: int, product_name: str,
                        total: float, payment_method: str) -> Future:
    site_url = getattr(settings, "SITE_URL", "https://tenora.store")
    price    = _fmt_price(total)

    inner = f"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      {_header_section(f"ORDER.{order_id:04d} // RECEIVED", C_PRIMARY,
        f"Commande n&deg;{order_id} re&ccedil;ue",
        "Votre commande a bien été enregistrée. Notre équipe la traite dans les plus brefs délais.")}
      {_divider()}
      {_detail_table([
          ("Référence",  f"#{order_id}"),
          ("Produit",     product_name),
          ("Total",       price),
          ("Paiement",    payment_method),
          ("Statut",      "En attente"),
      ])}
      {_status_chip(C_WARNING, "EN.ATTENTE")}
      {_info_block(C_PRIMARY,
        "Pensez &agrave; joindre votre re&ccedil;u de paiement depuis votre espace commandes "
        "pour acc&eacute;l&eacute;rer le traitement.")}
      {_cta_button(f"{site_url}/mes-commandes", "Suivre ma commande")}
    </table>"""

    return _send(email, f"Commande #{order_id} enregistrée — {settings.APP_NAME}",
          _base(inner, f"Commande #{order_id} confirmée — {price}"))


# ─── 3. Commande complétée — client ───────────────────────────────────────────

def send_order_completed(email: str, order_id: int, product_name: str, total_price: float) -> Future:
    site_url = getattr(settings, "SITE_URL", "https://tenora.store")
    price    = _fmt_price(total_price)

    inner = f"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      {_header_section(f"ORDER.{order_id:04d} // VALIDATED", C_SUCCESS,
        "Commande valid&eacute;e",
        f"Votre commande n&deg;{order_id} a été validée et traitée avec succès. Merci de votre confiance.")}
      {_divider()}
      {_detail_table([
          ("Référence",    f"#{order_id}"),
          ("Produit",       product_name),
          ("Montant payé",  price),
          ("Statut",        "Validé"),
      ])}
      {_status_chip(C_SUCCESS, "CONFIRME")}
      {_info_block(C_SUCCESS,
        "Un probl&egrave;me avec votre commande&nbsp;? "
        "Contactez notre &eacute;quipe sur WhatsApp, nous r&eacute;pondons sous 30 minutes.")}
      {_cta_button(f"{site_url}/mes-commandes", "Voir mes commandes")}
    </table>"""

    future = _send(email, f"Commande #{order_id} validée — {settings.APP_NAME}",
          _base(inner, f"Commande #{order_id} confirmée — {product_name}"))
    logger.success(f"Mail validation envoyé | order_id={order_id} | email={email}")
    return future


# ─── 4. Commande rejetée — client ─────────────────────────────────────────────

def send_order_rejected(email: str, order_id: int, product_name: str,
                         staff_note: str | None) -> Future:
    site_url   = getattr(settings, "SITE_URL", "https://tenora.store")
    note_block = ""
    if staff_note:
        note_block = f"""<tr><td style="padding:22px 36px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:4px;background:{C_DANGER};font-size:0;line-height:0;">&nbsp;</td>
              <td style="padding:14px 16px;background:{C_CARD_2};
                border:1px solid {C_BORDER};border-left:0;">
                <p style="margin:0 0 6px;font-family:{F_MONO};font-size:10px;
                  font-weight:700;letter-spacing:0.2em;text-transform:uppercase;
                  color:{C_DANGER};">// MOTIF.REJET</p>
                <p style="margin:0;font-family:{F_BODY};font-size:13px;
                  color:{C_FG_DIM};line-height:1.6;">{staff_note}</p>
              </td>
            </tr>
          </table>
        </td></tr>"""

    inner = f"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      {_header_section(f"ORDER.{order_id:04d} // REJECTED", C_DANGER,
        f"Commande n&deg;{order_id} rejet&eacute;e",
        f"Votre commande pour <strong style='color:{C_FG};'>{product_name}</strong> n'a pas pu être traitée.")}
      {_divider()}
      {_detail_table([
          ("Référence", f"#{order_id}"),
          ("Produit",    product_name),
          ("Statut",     "Rejeté"),
      ])}
      {note_block}
      {_status_chip(C_DANGER, "REJETE")}
      {_info_block(C_DANGER,
        "Vous pensez qu&rsquo;il s&rsquo;agit d&rsquo;une erreur&nbsp;? "
        "Contactez notre &eacute;quipe sur WhatsApp avant de repasser commande.")}
      {_cta_button(f"{site_url}/boutique", "Retour à la boutique", C_FG, C_BG)}
    </table>"""

    future = _send(email, f"Commande #{order_id} rejetée — {settings.APP_NAME}",
          _base(inner, f"Commande #{order_id} non traitée"))
    logger.success(f"Mail rejet envoyé | order_id={order_id} | email={email}")
    return future


# ─── 5. Remboursement — client ────────────────────────────────────────────────

def send_order_refunded(email: str, order_id: int, product_name: str, total_price: float) -> Future:
    site_url = getattr(settings, "SITE_URL", "https://tenora.store")
    price    = _fmt_price(total_price)

    inner = f"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      {_header_section(f"ORDER.{order_id:04d} // REFUND", C_SECONDARY,
        "Remboursement en cours",
        f"Un remboursement pour votre commande n&deg;{order_id} a été initié.")}
      {_divider()}
      {_detail_table([
          ("Référence",        f"#{order_id}"),
          ("Produit",           product_name),
          ("Montant remboursé", price),
          ("Statut",            "Remboursement initié"),
      ])}
      {_status_chip(C_SECONDARY, "REMBOURSE")}
      {_info_block(C_SECONDARY,
        "Le remboursement sera effectué via votre mode de paiement initial. "
        "Contactez-nous sur WhatsApp si vous ne le recevez pas sous 24h.")}
      {_cta_button(f"{site_url}/mes-commandes", "Voir mes commandes", C_SECONDARY, C_FG)}
    </table>"""

    future = _send(email, f"Remboursement commande #{order_id} — {settings.APP_NAME}",
          _base(inner, f"Remboursement #{order_id} — {price}"))
    logger.success(f"Mail remboursement envoyé | order_id={order_id} | email={email}")
    return future


# ─── 6. Nouvelle commande — admins ────────────────────────────────────────────

def send_admin_new_order(order_id: int, user_email: str, product_name: str,
                          total: float, payment_method: str,
                          customer_info: dict | None = None) -> Future | None:
    admins = _get_admins()
    if not admins:
        logger.debug("Aucun MAIL_ADMIN configuré — alerte ignorée")
        return

    site_url = getattr(settings, "SITE_URL", "https://tenora.store")
    price    = _fmt_price(total)

    extra_rows = [
        (k.replace("_", " ").capitalize(), str(v))
        for k, v in (customer_info or {}).items()
    ]

    inner = f"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      {_header_section(f"INCOMING.ORDER.{order_id:04d}", C_WARNING,
        f"Nouvelle commande &mdash; #{order_id}",
        f"Une nouvelle commande vient d&rsquo;&ecirc;tre pass&eacute;e sur {settings.APP_NAME}.")}
      {_divider()}
      {_detail_table([
          ("Client",   user_email),
          ("Produit",  product_name),
          ("Total",    price),
          ("Paiement", payment_method),
      ] + extra_rows)}
      {_status_chip(C_WARNING, "ACTION.REQUISE")}
      {_cta_button(f"{site_url}/panel/orders/{order_id}/edit",
                   "Traiter la commande", C_WARNING, C_BG)}
    </table>"""

    future = _send(admins, f"[Tenora] Nouvelle commande #{order_id} — {price}",
          _base(inner, f"#{order_id} · {user_email} · {price}"))
    logger.info(f"Alerte admin envoyée | order_id={order_id} | admins={admins}")
    return future


# ─── 7. Reçu joint — admins ───────────────────────────────────────────────────

def send_admin_screenshot_uploaded(order_id: int, user_email: str,
                                    product_name: str) -> Future | None:
    admins = _get_admins()
    if not admins:
        return

    site_url = getattr(settings, "SITE_URL", "https://tenora.store")

    inner = f"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      {_header_section(f"RECEIPT.{order_id:04d} // UPLOADED", C_INFO,
        f"Re&ccedil;u joint &mdash; Commande #{order_id}",
        "Un client vient de joindre son reçu de paiement. La commande est prête à être traitée.")}
      {_divider()}
      {_detail_table([
          ("Commande",       f"#{order_id}"),
          ("Client",          user_email),
          ("Produit",         product_name),
          ("Action requise",  "Valider le reçu"),
      ])}
      {_status_chip(C_INFO, "RECU.RECU")}
      {_cta_button(f"{site_url}/panel/orders/{order_id}/edit",
                   "Traiter maintenant", C_INFO, C_FG)}
    </table>"""

    future = _send(admins, f"[Tenora] Reçu joint — Commande #{order_id} à traiter",
          _base(inner, f"Commande #{order_id} — {user_email} — reçu joint"))
    logger.info(f"Alerte screenshot envoyée | order_id={order_id}")
    return future
