import { Link } from 'react-router-dom'
import RightSidebar from '../components/layout/RightSidebar'

interface ExploreItem {
  id: string
  author: string
  title: string
  tags: string
  image: string
  to?: string
}

// The four unique explore entries; rendered REPEAT_COUNT times to fill the grid.
const exploreItems: ExploreItem[] = [
  {
    id: 'ceasefire',
    author: '@founder',
    title: 'Russia x Ukraine ceasefire in 2025?',
    tags: '#war #ukraine',
    image: '/img/russia-x-ukraine-ceasefire-in-2025-w2voYOygx80B.webp',
    to: '/trade-founder',
  },
  {
    id: 'el-clasico',
    author: '@FC Barcelona',
    title: 'El Clasico - Barcelona vs Real Madrid! Who will win?',
    tags: '#barcelona #elclassico',
    image: '/img/el-classico.png',
    to: '/trade',
  },
  {
    id: 'eth-price',
    author: '@VitalikButerin',
    title: 'Ethereum price on August 18?',
    tags: '#crypto #eth',
    image: '/img/ETHfullsize.webp',
  },
  {
    id: 'microstrategy',
    author: '@polytics',
    title: 'Will MicroStrategy purchase Bitcoin August 12-18?',
    tags: '#crypto #btc',
    image: '/img/will-microstrategy-purchase-bitcoin-july-1-7-mzoE5TYk_cCI.webp',
  },
]

const REPEAT_COUNT = 3

function ExploreTrendingItem({ item }: { item: ExploreItem }) {
  const className = 'p-3 border-bottom d-flex align-items-center text-white text-decoration-none'
  const content = (
    <>
      <div>
        <div className="text-muted fw-light d-flex align-items-center">
          <small>{item.author}</small>
          <span className="mx-1 material-icons md-3">circle</span>
          <small>Live</small>
        </div>
        <p className="fw-bold mb-0 pe-3">{item.title}</p>
        <small className="text-muted">Trending with</small>
        <br />
        <span className="text-primary">{item.tags}</span>
      </div>
      <img
        style={{ maxWidth: '100px' }}
        src={item.image}
        className="img-fluid rounded-4 ms-auto"
        alt="profle-img"
      />
    </>
  )

  return item.to ? (
    <Link to={item.to} className={className}>
      {content}
    </Link>
  ) : (
    <a href="#" className={className}>
      {content}
    </a>
  )
}

export default function MarketPage() {
  return (
    <>
      <main className="col col-xl-6 order-xl-2 col-lg-12 order-lg-1 col-md-12 col-sm-12 col-12">
        <div className="main-content border-start border-end p-lg-3">
          <div className="d-flex align-items-center mb-3">
            <Link to="/" className="material-icons text-white text-decoration-none m-none me-3">
              arrow_back
            </Link>
            <p className="ms-2 mb-0 fw-bold text-body fs-6">Explore</p>
          </div>
          <div className="bg-glass rounded-4 overflow-hidden shadow-sm mb-4 mb-lg-0">
            {Array.from({ length: REPEAT_COUNT }).flatMap((_, repeat) =>
              exploreItems.map((item) => (
                <ExploreTrendingItem key={`${repeat}-${item.id}`} item={item} />
              )),
            )}
          </div>
        </div>
      </main>
      <RightSidebar />
    </>
  )
}
