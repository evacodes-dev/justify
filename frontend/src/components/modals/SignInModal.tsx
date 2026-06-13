import Modal from 'react-bootstrap/Modal'
import { useUi } from '../layout/UiContext'
import { MetaMaskIcon, TrustWalletIcon, CoinbaseIcon, WalletConnectIcon } from './WalletIcons'

const GOOGLE_OAUTH_URL =
  'https://accounts.google.com/o/oauth2/v2/auth' +
  '?client_id=167186832136-9egb92r9b08iktqln4ktdgvgqi091fpr' +
  '&redirect_uri=https://justify.market/auth/callback' +
  '&response_type=code' +
  '&scope=openid%20email%20profile' +
  '&prompt=select_account' +
  '&access_type=offline'

// Wallet connections (MetaMask / Trust / Coinbase / WalletConnect) will be wired
// to the Web3 layer (embedded wallets) during the upcoming integration phase.
export default function SignInModal() {
  const { activeModal, closeModal } = useUi()
  return (
    <Modal
      show={activeModal === 'sign'}
      onHide={closeModal}
      centered
      contentClassName="rounded-4 shadow-sm p-4 border-0 bg-brown-gradient"
    >
      <div className="login-modal">
        <h2 className="login-title">Welcome to Justify</h2>

        <a href={GOOGLE_OAUTH_URL} className="btn-google" style={{ textDecoration: 'none' }}>
          <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" />
          Continue with Google
        </a>

        <div className="login-divider">OR</div>

        <form className="login-form">
          <input type="email" placeholder="Enter your email" required />
          <button type="submit">Continue</button>
        </form>

        <div className="login-wallets">
          <MetaMaskIcon />
          <TrustWalletIcon />
          <CoinbaseIcon />
          <WalletConnectIcon />
        </div>

        <p className="login-terms">
          By continuing, you agree to our <a href="#">Terms</a> and <a href="#">Privacy</a>.
        </p>
      </div>
    </Modal>
  )
}
