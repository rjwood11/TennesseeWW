interface Props {
  value: string;
}

export default function LastUpdated({ value }: Props) {
  return <div className="tnww-updated">Updated {new Date(value).toLocaleString()}</div>;
}
