export default function RentalsSignupRedirect() {
  return null;
}

export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/rentals/pricing',
      permanent: false,
    },
  };
}
