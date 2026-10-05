import { clamp, Average } from '../utils/math';

describe('clamp function', () => {
  it('should return the min value if the input is less than min', () => {
    expect(clamp(5, 10, 20)).toBe(10);
  });

  it('should return the max value if the input is greater than max', () => {
    expect(clamp(25, 10, 20)).toBe(20);
  });

  it('should return the input value if it is within the range', () => {
    expect(clamp(15, 10, 20)).toBe(15);
  });

  it('should throw an error if min is greater than max', () => {
    expect(() => clamp(5, 20, 10)).toThrow('min must not be greater than max');
  });

  it('should handle negative numbers correctly', () => {
    expect(clamp(-5, -10, -5)).toBe(-5);
  });

  it('should handle zero as min or max', () => {
    expect(clamp(0, -5, 0)).toBe(0);
  });

  it('should handle min and max as zero', () => {
    expect(clamp(0, 0, 0)).toBe(0);
  });

  it('should handle min as zero and max as positive', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('should handle min as negative and max as zero', () => {
    expect(clamp(-5, -10, 0)).toBe(-5);
  });
});

describe('Average class', () => {
  it('should add values correctly', () => {
    const avg = new Average();
    avg.add(10);
    avg.add(20);
    expect(avg.value()).toBe(15);
  });

  it('should return 0 when no values are added', () => {
    const avg = new Average();
    expect(avg.value()).toBe(0);
  });

  it('should handle adding zero values', () => {
    const avg = new
